import { describe, expect, it } from "vitest";
import {
	type ApiData,
	ApiError,
	apiDelete,
	apiDownload,
	apiGet,
	apiPatch,
	apiPost,
	apiPut,
	createApiClient,
	isApiError,
	type SureClient,
} from "./client";

type FetchImpl = (input: Request) => Promise<Response>;

function testClient(fetchImpl: FetchImpl): SureClient {
	// NB: absolute base URL here is test-only. Production browser calls use
	// a same-origin BFF base (see client.ts); the Rails origin is server-side.
	return createApiClient({
		baseUrl: "http://localhost:3000",
		fetchImpl,
	});
}

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function validCollection(): Record<string, unknown> {
	return {
		accounts: [],
		pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
	};
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}
	expect(isApiError(caught)).toBe(true);
	if (!isApiError(caught)) {
		throw new Error("Expected the request to throw an ApiError.");
	}
	return caught;
}

const SECRET_TOKEN = "secret-token-abc-123";
const SECRET_NAME = "Secret Offshore Holdings";

describe("mandatory response validation", () => {
	it("throws a correlated, redacted contract error for malformed success payloads", async () => {
		const client = testClient(async () =>
			jsonResponse(
				{
					accounts: [{ id: "not-a-uuid", token: SECRET_TOKEN, name: SECRET_NAME }],
					pagination: { page: 1, per_page: 25, total_count: 1, total_pages: 1 },
				},
				200,
			),
		);

		const error = await expectApiError(
			apiGet(client, "/api/v1/accounts", { requestId: "req-contract-1" }),
		);

		expect(error.kind).toBe("contract");
		expect(error.status).toBe(200);
		expect(error.requestId).toBe("req-contract-1");
		expect(error.retryable).toBe(false);
		const serialized = JSON.stringify({ message: error.message, details: error.details });
		expect(serialized).toContain("GET /api/v1/accounts");
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain(SECRET_NAME);
		expect(serialized).not.toContain("not-a-uuid");
	});

	it("fails closed on undocumented success statuses", async () => {
		const client = testClient(async () => jsonResponse({ ok: true }, 200));

		const error = await expectApiError(
			apiPost(client, "/api/v1/accounts", {
				body: { account: { name: "Cash", balance: 0, account_type: "depository" } },
				requestId: "req-undocumented-1",
			}),
		);

		// POST /accounts documents 201/403/422 — a 200 is undocumented.
		expect(error.kind).toBe("contract");
		expect(error.requestId).toBe("req-undocumented-1");
	});

	it("fails closed for unknown operations", async () => {
		const client = testClient(async () => jsonResponse({ ok: true }, 200));

		const error = await expectApiError(
			// @ts-expect-error - unknown paths cannot have contracts
			apiGet(client, "/api/v1/nope", { requestId: "req-unknown-1" }),
		);

		expect(error.kind).toBe("contract");
		expect(error.requestId).toBe("req-unknown-1");
	});

	it("validates through every public entry point (no unvalidated path)", async () => {
		const garbage = async () => jsonResponse({ garbage: true }, 200);
		const body = { account: { name: "Cash", balance: 0, account_type: "depository" } } as const;

		await expect(
			expectApiError(apiGet(testClient(garbage), "/api/v1/accounts")),
		).resolves.toMatchObject({ kind: "contract" });
		await expect(
			expectApiError(apiPost(testClient(garbage), "/api/v1/accounts", { body })),
		).resolves.toMatchObject({ kind: "contract" });
		await expect(
			expectApiError(
				apiPatch(testClient(garbage), "/api/v1/tags/{id}", {
					params: { path: { id: "t" } },
					body: { tag: { name: "T" } },
				}),
			),
		).resolves.toMatchObject({ kind: "contract" });
		await expect(
			expectApiError(
				apiDelete(testClient(garbage), "/api/v1/tags/{id}", { params: { path: { id: "t" } } }),
			),
		).resolves.toMatchObject({ kind: "contract" });
		// eslint-disable-next-line typescript/no-unsafe-type-assertion -- PUT has no documented operation; this untyped call must still fail closed through contract lookup.
		const putError = expectApiError(apiPut(testClient(garbage), "/x" as never, {} as never));
		await expect(putError).resolves.toMatchObject({ kind: "contract" });
	});

	it("passes valid payloads through with stripped unknown keys", async () => {
		const client = testClient(async () =>
			jsonResponse({ ...validCollection(), future_field: "ignored" }),
		);

		const result: ApiData<"get", "/api/v1/accounts"> = (await apiGet(client, "/api/v1/accounts"))
			.data;
		expect(result.pagination.page).toBe(1);
		expect("future_field" in result).toBe(false);
	});
});

describe("error payload hygiene", () => {
	it("keeps the status-mapped kind but drops malformed error bodies", async () => {
		const client = testClient(async () =>
			jsonResponse({ wrong: "shape", leaked: SECRET_TOKEN }, 422),
		);

		const error = await expectApiError(
			apiPost(client, "/api/v1/accounts", {
				body: { account: { name: "", balance: 0, account_type: "depository" } },
				requestId: "req-bad-error-1",
			}),
		);

		expect(error.kind).toBe("validation");
		expect(error.status).toBe(422);
		expect(error.requestId).toBe("req-bad-error-1");
		const serialized = JSON.stringify({ message: error.message, details: error.details });
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain("shape");
	});

	it("extracts message and details from valid error bodies", async () => {
		const client = testClient(async () =>
			jsonResponse({ error: "unauthorized", message: "Session expired" }, 401),
		);

		const error = await expectApiError(apiGet(client, "/api/v1/balances"));
		expect(error.kind).toBe("unauthorized");
		expect(error.message).toBe("Session expired");
	});

	it("sanitizes non-JSON error bodies on the binary download path", async () => {
		const client = testClient(async () => new Response("oops", { status: 409 }));

		const error = await expectApiError(
			apiDownload(client, "/api/v1/family_exports/{id}/download", {
				params: { path: { id: "export-1" } },
			}),
		);

		expect(error.kind).toBe("conflict");
		expect(JSON.stringify(error.details ?? null)).not.toContain("oops");
	});
});
