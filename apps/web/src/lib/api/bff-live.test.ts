// Live BFF → Rails → database integration suite (apps/web).
//
// This is the real-integration evidence for the frontend harness: it drives
// the hardened BFF transport (`proxyToSureApi`) against a live Rails test
// API seeded with deterministic e2e data, proving the full server leg
// (BFF validation → Rails → PostgreSQL) with generated-contract checks on
// both sides. The browser leg is covered by the Playwright smoke suite
// (`scripts/e2e-smoke.mjs`); focused unit suites use the
// contract-validated mocks in `src/test-utils/mock-handlers.ts` — mocks are
// never the only integration evidence.
//
// Gated by `SURE_E2E_LIVE=1` so the default `pnpm test` run stays hermetic
// (no network, no Rails). The e2e orchestrator (`scripts/e2e-services.mjs`)
// boots isolated services, seeds them, sets this variable, and runs only
// this file:
//
//   SURE_E2E_LIVE=1 SURE_E2E_RAILS_ORIGIN=http://127.0.0.1:3101 \
//     pnpm vitest run src/lib/api/bff-live.test.ts
//
// Tokens are held in memory for the bearer follow-up call and never logged;
// failure output contains only redacted contract messages.
import { describe, expect, it } from "vitest";
import { BffError } from "~/lib/bff-policy";
import { proxyToSureApi } from "~/lib/sure-api-bff.server";
import { fixtureDevice } from "~/test-utils/api-fixtures";
import { getOperationContract, parseOperationResponse } from "./operation-contracts";
import { PostApiV1AuthLogin200Response } from "./zod/endpoints/auth/auth.zod";
import { GetApiV1Accounts200Response } from "./zod/endpoints/accounts/accounts.zod";

const LIVE = process.env["SURE_E2E_LIVE"] === "1";
const RAILS_ORIGIN = process.env["SURE_E2E_RAILS_ORIGIN"] ?? "http://127.0.0.1:3101";
const BFF_ORIGIN = process.env["SURE_E2E_BFF_ORIGIN"] ?? "http://127.0.0.1:4173";
const EMAIL = process.env["SURE_E2E_EMAIL"] ?? "member@e2e.sure.invalid";
const PASSWORD = process.env["SURE_E2E_PASSWORD"] ?? "E2e-supersecret-1!";

interface LoginPayload {
	readonly access_token?: string | undefined;
	readonly user?: { readonly email?: string | undefined } | undefined;
}

function decodeJson(body: ArrayBuffer | ReadableStream<Uint8Array>): unknown {
	if (!(body instanceof ArrayBuffer)) {
		throw new Error("[bff-live] expected a buffered body (stream mode is off)");
	}
	return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

/** Parse a live response through its generated contract (throws redacted). */
function parseLive(operation: string, status: number, payload: unknown): unknown {
	const contract = getOperationContract(
		operation.split(" ")[0] ?? "",
		operation.split(" ")[1] ?? "",
	);
	if (contract === undefined) {
		throw new Error(`[bff-live] unknown operation "${operation}"`);
	}
	const parsed = parseOperationResponse(contract, status, payload);
	if (!parsed.ok) {
		throw new Error(`[bff-live] live response violated ${operation} ${String(status)}`);
	}
	return parsed.data;
}

async function login(password: string): Promise<LoginPayload> {
	const result = await proxyToSureApi(
		{
			method: "POST",
			path: "/api/v1/auth/login",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: EMAIL,
				password,
				device: fixtureDevice(),
			}),
			origin: BFF_ORIGIN,
			csrfToken: "e2e-csrf-token",
			bffOrigin: BFF_ORIGIN,
		},
		{ upstreamOrigin: RAILS_ORIGIN },
	);
	// The generated parser both validates the live shape and yields the
	// typed payload — no hand-written narrowing, no unsafe assertions.
	return PostApiV1AuthLogin200Response.parse(
		parseLive("POST /api/v1/auth/login", result.status, decodeJson(result.body)),
	);
}

describe.skipIf(!LIVE)("live BFF → Rails → database", () => {
	it("logs in the seeded e2e user through the BFF", async () => {
		const payload = await login(PASSWORD);
		expect(payload.user?.email).toBe(EMAIL);
		expect(typeof payload.access_token).toBe("string");
	});

	it("reads seeded finance data back through the BFF (database proof)", async () => {
		const session = await login(PASSWORD);
		const token = session.access_token;
		if (typeof token !== "string") {
			throw new Error("[bff-live] login did not return an access token");
		}
		const result = await proxyToSureApi(
			{
				method: "GET",
				path: "/api/v1/accounts",
				// Browser credentials never ride headers through the BFF
				// (stripped as unsafe); the per-session bearer attaches
				// server-side via `auth` (ADR-0001 D1/REQ-SESS-01).
				auth: { bearerToken: token },
				bffOrigin: BFF_ORIGIN,
			},
			{ upstreamOrigin: RAILS_ORIGIN },
		);
		expect(result.status).toBe(200);
		// Every BFF response carries `private, no-store` (REQ-TRAN-05).
		expect(result.headers.get("Cache-Control")).toBe("private, no-store");
		const collection = GetApiV1Accounts200Response.parse(
			parseLive("GET /api/v1/accounts", result.status, decodeJson(result.body)),
		);
		expect(collection.accounts.map((account) => account.name)).toContain("E2E Checking");
	});

	it("maps invalid credentials to a safe upstream error", async () => {
		// A resolved login would yield a payload object, never a BffError —
		// so this single unconditional assertion covers both branches.
		const outcome = await login("Wrong-password-0!").then(
			() => "unexpected-login-success",
			(cause: unknown) => cause,
		);
		expect(outcome).toBeInstanceOf(BffError);
	});
});
