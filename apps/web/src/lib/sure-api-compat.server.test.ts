/**
 * Server-side Sure API compatibility check tests (`t_alt_fnd_015`).
 *
 * Readiness behaviour: `checkApiCompatibility` fetches the public metadata
 * endpoint through the hardened transport and reports the correct state
 * for compatible and incompatible versions/capabilities — `ready`,
 * `too-old`, `too-new`, `missing-capability` — plus the transport states
 * `unreachable` (network/timeout/5xx) and `unauthenticated` (401/403), and
 * `too-old` for servers that predate metadata (404). Decisions and
 * messages never carry the upstream origin.
 */
import { describe, expect, it } from "vitest";
import { REQUIRED_API_CAPABILITIES } from "./sure-api-compat";
import { checkApiCompatibility } from "./sure-api-compat.server";

// Deliberately distinctive so any origin leak is unmissable in assertions.
const UPSTREAM = "http://internal-sure-api-xyz.test:3000";

function metadataBody(version: string, capabilities: readonly string[]): Record<string, unknown> {
	return { api_version: version, capabilities: [...capabilities] };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function metadataFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
	return async (input: string | URL | Request): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		return handler(url);
	};
}

const FULL_CAPABILITIES = [...REQUIRED_API_CAPABILITIES];

const failingFetch: typeof fetch = () => {
	throw new TypeError("fetch failed");
};

describe("checkApiCompatibility readiness", () => {
	it("reports ready for a supported contract", async () => {
		const fetchImpl = metadataFetch((url) => {
			expect(url).toBe(`${UPSTREAM}/api/v1/metadata`);
			return jsonResponse(200, metadataBody("1.0.0", FULL_CAPABILITIES));
		});
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "ready",
			serverVersion: "1.0.0",
		});
	});

	it("reports too-old for an older contract", async () => {
		const fetchImpl = metadataFetch(() => jsonResponse(200, metadataBody("0.9.0", [])));
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "too-old",
			serverVersion: "0.9.0",
		});
	});

	it("reports too-new for a newer contract", async () => {
		const fetchImpl = metadataFetch(() =>
			jsonResponse(200, metadataBody("2.0.0", FULL_CAPABILITIES)),
		);
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "too-new",
			serverVersion: "2.0.0",
		});
	});

	it("reports missing-capability with the absent tokens", async () => {
		const fetchImpl = metadataFetch(() => jsonResponse(200, metadataBody("1.0.0", ["auth.login"])));
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "missing-capability",
			serverVersion: "1.0.0",
			missingCapabilities: ["auth.refresh", "auth.logout"],
		});
	});

	it("reports too-old when metadata does not exist (legacy server)", async () => {
		const fetchImpl = metadataFetch(() => jsonResponse(404, { error: "record_not_found" }));
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "too-old",
		});
	});

	it("reports unauthenticated when deployment credentials are rejected", async () => {
		for (const status of [401, 403]) {
			const fetchImpl = metadataFetch(() => jsonResponse(status, { error: "unauthorized" }));
			await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual(
				{ state: "unauthenticated" },
			);
		}
	});

	it("reports unreachable on network failure and server errors", async () => {
		await expect(
			checkApiCompatibility({ fetchImpl: failingFetch, upstreamOrigin: UPSTREAM }),
		).resolves.toEqual({ state: "unreachable" });

		for (const status of [429, 500, 502]) {
			const fetchImpl = metadataFetch(() => jsonResponse(status, { error: "boom" }));
			await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual(
				{ state: "unreachable" },
			);
		}
	});

	it("reports too-new when metadata speaks an unknown shape", async () => {
		const fetchImpl = metadataFetch(() => jsonResponse(200, { bogus: true }));
		await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual({
			state: "too-new",
		});
	});

	it("never leaks the upstream origin in the decision", async () => {
		const cases: { fetchImpl: typeof fetch }[] = [
			{
				fetchImpl: metadataFetch(() => jsonResponse(200, metadataBody("2.0.0", FULL_CAPABILITIES))),
			},
			{ fetchImpl: metadataFetch(() => jsonResponse(404, { error: "record_not_found" })) },
			{ fetchImpl: metadataFetch(() => jsonResponse(401, { error: "unauthorized" })) },
			{ fetchImpl: metadataFetch(() => jsonResponse(500, { error: "boom" })) },
		];
		for (const { fetchImpl } of cases) {
			const decision = await checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM });
			expect(JSON.stringify(decision)).not.toContain(UPSTREAM);
		}
	});

	it("sends the deployment API key so gated deployments can authenticate the probe", async () => {
		let seenUrl = "";
		let seenHeaders: Headers | undefined;
		const fetchImpl: typeof fetch = async (input, init) => {
			seenUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			seenHeaders = new Headers(init?.headers);
			return jsonResponse(200, metadataBody("1.0.0", FULL_CAPABILITIES));
		};
		await expect(
			checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM, apiKey: "deploy-key" }),
		).resolves.toEqual({ state: "ready", serverVersion: "1.0.0" });
		expect(seenUrl).toBe(`${UPSTREAM}/api/v1/metadata`);
		expect(seenHeaders?.get("X-Api-Key")).toBe("deploy-key");
	});

	it("resolves the deployment key from SURE_API_KEY", async () => {
		const previous = process.env["SURE_API_KEY"];
		try {
			process.env["SURE_API_KEY"] = "env-key";
			let seenHeaders: Headers | undefined;
			const fetchImpl: typeof fetch = async (_input, init) => {
				seenHeaders = new Headers(init?.headers);
				return jsonResponse(200, metadataBody("1.0.0", FULL_CAPABILITIES));
			};
			await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual(
				{ state: "ready", serverVersion: "1.0.0" },
			);
			expect(seenHeaders?.get("X-Api-Key")).toBe("env-key");
		} finally {
			if (previous === undefined) {
				delete process.env["SURE_API_KEY"];
			} else {
				process.env["SURE_API_KEY"] = previous;
			}
		}
	});

	it("omits the key header when no deployment key is configured", async () => {
		const previous = process.env["SURE_API_KEY"];
		try {
			delete process.env["SURE_API_KEY"];
			let seenHeaders: Headers | undefined;
			const fetchImpl: typeof fetch = async (_input, init) => {
				seenHeaders = new Headers(init?.headers);
				return jsonResponse(200, metadataBody("1.0.0", FULL_CAPABILITIES));
			};
			await expect(checkApiCompatibility({ fetchImpl, upstreamOrigin: UPSTREAM })).resolves.toEqual(
				{ state: "ready", serverVersion: "1.0.0" },
			);
			expect(seenHeaders?.has("X-Api-Key")).toBe(false);
			expect(seenHeaders?.get("X-Request-Id")).toMatch(/./);
		} finally {
			if (previous !== undefined) {
				process.env["SURE_API_KEY"] = previous;
			}
		}
	});
});
