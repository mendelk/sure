import { describe, expect, it } from "vitest";
import { BFF_MAX_REQUEST_BYTES, BFF_MAX_RESPONSE_BYTES, BffError } from "./bff-policy";
import { getOperationContract } from "./api/bff-contracts.server";
import { listBffAllowList } from "./bff-policy";
import { getSureApiKey, proxyToSureApi } from "./sure-api-bff.server";
import type { BffProxyRequest } from "./sure-api-bff.server";

// Transport verification (t_alt_fnd_005 + ADR-0001 REQ-TRAN-*/CTL-SEC-02,
// contracts from t_alt_fnd_018): SSRF, header stripping, method/path
// validation, CSRF/origin, generated-parser consumption on outgoing and
// upstream data, size limits, timeout/abort/retry semantics, binary
// streaming, caching headers, upstream error mapping, and credential
// non-disclosure. The upstream origin is fixed per test via deps —
// production resolves it from server-only env.

const UPSTREAM = "http://sure-api.test";
const BFF_ORIGIN = "https://bff.test";
const UUID = "123e4567-e89b-12d3-a456-426614174000";
const STAMP = "2026-01-01T00:00:00Z";

const COLLECTION = {
	accounts: [],
	pagination: { page: 1, per_page: 25, total_count: 0, total_pages: 1 },
};

const TAG = {
	id: UUID,
	name: "Food",
	color: "#22c55e",
	created_at: STAMP,
	updated_at: STAMP,
};

const ACCOUNT = {
	id: UUID,
	name: "Cash",
	balance: "100.00",
	balance_cents: 10000,
	cash_balance: "100.00",
	cash_balance_cents: 10000,
	currency: "USD",
	classification: "asset",
	account_type: "depository",
	status: "active",
	created_at: STAMP,
	updated_at: STAMP,
};

const SESSION = {
	id: UUID,
	type: "SureImport",
	status: "pending",
	chunks_count: 0,
	summary: {},
	chunks: [],
	created_at: STAMP,
	updated_at: STAMP,
};

interface SeenCall {
	url: string;
	init: RequestInit;
}

function mockUpstream(handler: (call: SeenCall) => Response | Promise<Response>): {
	fetchImpl: typeof fetch;
	calls: SeenCall[];
} {
	const calls: SeenCall[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const call: SeenCall = { url, init: init ?? {} };
		calls.push(call);
		return handler(call);
	};
	return { fetchImpl, calls };
}

function jsonResponse(
	payload: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function baseRequest(overrides: Partial<BffProxyRequest> = {}): BffProxyRequest {
	return { method: "GET", path: "/api/v1/accounts", bffOrigin: BFF_ORIGIN, ...overrides };
}

function mutationRequest(overrides: Partial<BffProxyRequest> = {}): BffProxyRequest {
	return {
		method: "POST",
		path: "/api/v1/tags",
		origin: BFF_ORIGIN,
		csrfToken: "csrf-1",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ tag: { name: "Food" } }),
		bffOrigin: BFF_ORIGIN,
		...overrides,
	};
}

async function expectBffError(promise: Promise<unknown>): Promise<BffError> {
	let threw = false;
	let caught: unknown;
	try {
		await promise;
	} catch (error) {
		threw = true;
		caught = error;
	}
	expect(threw).toBe(true);
	expect(caught).toBeInstanceOf(BffError);
	if (!(caught instanceof BffError)) {
		throw new Error("Expected the proxy to throw a BffError.");
	}
	return caught;
}

function firstCall(calls: SeenCall[]): SeenCall {
	const call = calls[0];
	if (call === undefined) {
		throw new Error("Expected an upstream call to have been made.");
	}
	return call;
}

function requireBufferBody(body: ArrayBuffer | ReadableStream<Uint8Array>): ArrayBuffer {
	if (!(body instanceof ArrayBuffer)) {
		throw new Error("Expected a buffered ArrayBuffer body.");
	}
	return body;
}

function requireStreamBody(
	body: ArrayBuffer | ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
	if (!(body instanceof ReadableStream)) {
		throw new Error("Expected a streamed body.");
	}
	return body;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged;
}

/** Upstream that hangs until aborted (rejects like a timed-out fetch). */
const hangingUpstream: typeof fetch = async (_input, init) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener(
			"abort",
			() => {
				reject(new DOMException("The operation timed out.", "TimeoutError"));
			},
			{ once: true },
		);
	});

/** Upstream that rejects like a caller-aborted fetch. */
const abortingUpstream: typeof fetch = async (_input, init) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener(
			"abort",
			() => {
				reject(new DOMException("This operation was aborted.", "AbortError"));
			},
			{ once: true },
		);
	});

describe("SSRF and validation gates (REQ-TRAN-03)", () => {
	it("rejects absolute and escaping paths without touching the network", async () => {
		for (const path of [
			"https://evil.example.com/api/v1/accounts",
			"//evil.example.com/api/v1/accounts",
			"/api/v1/../admin",
			"/api/v1/%2e%2e/admin",
			"/api/v1/nope",
			"/oauth/token",
		]) {
			const { fetchImpl, calls } = mockUpstream(() => jsonResponse({}));
			const error = await expectBffError(
				proxyToSureApi(baseRequest({ path }), { fetchImpl, upstreamOrigin: UPSTREAM }),
			);
			expect(error.code).toBe("bad_path");
			expect(error.status).toBe(400);
			expect(calls).toHaveLength(0);
		}
	});

	it("rejects methods the route does not document", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({}));
		const error = await expectBffError(
			proxyToSureApi(baseRequest({ method: "POST", path: "/api/v1/balance_sheet" }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("bad_method");
		expect(error.status).toBe(405);
		expect(calls).toHaveLength(0);
	});

	it("rejects disallowed content types with 415", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({}));
		const error = await expectBffError(
			proxyToSureApi(mutationRequest({ headers: { "Content-Type": "text/html" } }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("bad_content_type");
		expect(error.status).toBe(415);
		expect(calls).toHaveLength(0);
	});

	it("pins every upstream call to the fixed origin with safe fetch options", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		await proxyToSureApi(baseRequest({ query: "?page=2" }), {
			fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		const call = firstCall(calls);
		expect(call.url).toBe(`${UPSTREAM}/api/v1/accounts?page=2`);
		expect(call.init.method).toBe("GET");
		expect(call.init.credentials).toBe("omit");
		expect(call.init.redirect).toBe("manual");
	});

	it("resolves every allow-listed operation to a generated contract", () => {
		const missing: string[] = [];
		for (const { template, methods } of listBffAllowList()) {
			for (const method of methods) {
				if (getOperationContract(method, template) === undefined) {
					missing.push(`${method} ${template}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});
});

describe("forwarded-header stripping (REQ-TRAN-03)", () => {
	it("drops spoofable and credential headers before proxying", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		await proxyToSureApi(
			baseRequest({
				headers: {
					Accept: "application/json",
					Cookie: "session=abc",
					Authorization: "Bearer browser-smuggled",
					"X-Api-Key": "browser-smuggled",
					"X-Forwarded-Host": "evil.example.com",
					"X-Forwarded-Proto": "https",
					"X-Forwarded-For": "1.2.3.4",
					Forwarded: "for=1.2.3.4",
				},
			}),
			{ fetchImpl, upstreamOrigin: UPSTREAM },
		);
		const upstreamHeaders = new Headers(firstCall(calls).init.headers);
		expect(upstreamHeaders.get("Accept")).toBe("application/json");
		expect(upstreamHeaders.get("X-Request-Id")).toMatch(/./);
		for (const name of [
			"Cookie",
			"Authorization",
			"X-Api-Key",
			"X-Forwarded-Host",
			"X-Forwarded-Proto",
			"X-Forwarded-For",
			"Forwarded",
		]) {
			expect(upstreamHeaders.has(name)).toBe(false);
		}
	});
});

describe("CSRF and same-origin enforcement (REQ-TRAN-01)", () => {
	it("lets GETs through without origin or token", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		await proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM });
		expect(calls).toHaveLength(1);
	});

	it.each([
		{ origin: undefined, csrfToken: "t", code: "origin" },
		{ origin: "https://evil.example.com", csrfToken: "t", code: "origin" },
		{ origin: BFF_ORIGIN, csrfToken: undefined, code: "csrf" },
		{ origin: BFF_ORIGIN, csrfToken: "  ", code: "csrf" },
	])("rejects mutations with %j", async ({ origin, csrfToken, code }) => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({}));
		const error = await expectBffError(
			proxyToSureApi(mutationRequest({ origin, csrfToken }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe(code);
		expect(error.status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	it("proxies mutations with same-origin plus token", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(TAG, 201));
		const result = await proxyToSureApi(mutationRequest(), {
			fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.status).toBe(201);
		expect(calls).toHaveLength(1);
	});
});

describe("generated-contract request validation (t_alt_fnd_018)", () => {
	it("rejects malformed request bodies with a redacted 400", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(TAG, 201));
		const error = await expectBffError(
			proxyToSureApi(mutationRequest({ body: JSON.stringify({ tag: { password: "hunter2" } }) }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(400);
		expect(error.requestId).toMatch(/./);
		expect(JSON.stringify(error.toSafeBody())).not.toContain("hunter2");
		expect(calls).toHaveLength(0);
	});

	it("rejects invalid query values and accepts coerced numerics", async () => {
		const bad = mockUpstream(() => jsonResponse(COLLECTION));
		const badError = await expectBffError(
			proxyToSureApi(baseRequest({ query: "?page=one" }), {
				fetchImpl: bad.fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(badError.code).toBe("contract");
		expect(badError.status).toBe(400);
		expect(bad.calls).toHaveLength(0);

		const good = mockUpstream(() => jsonResponse(COLLECTION));
		const result = await proxyToSureApi(baseRequest({ query: "?page=2&per_page=10" }), {
			fetchImpl: good.fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.status).toBe(200);
		expect(good.calls).toHaveLength(1);
	});

	it("rejects undocumented query params and unknown path ids fail closed", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		const error = await expectBffError(
			proxyToSureApi(baseRequest({ query: "?admin=true" }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("contract");
		expect(calls).toHaveLength(0);
	});

	it("validates uuid path params through the generated parser", async () => {
		const bad = mockUpstream(() => jsonResponse(ACCOUNT));
		const badError = await expectBffError(
			proxyToSureApi(baseRequest({ path: "/api/v1/accounts/not-a-uuid" }), {
				fetchImpl: bad.fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(badError.code).toBe("contract");
		expect(bad.calls).toHaveLength(0);

		const good = mockUpstream(() => jsonResponse(ACCOUNT));
		const result = await proxyToSureApi(baseRequest({ path: `/api/v1/accounts/${UUID}` }), {
			fetchImpl: good.fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.status).toBe(200);
		expect(good.calls).toHaveLength(1);
	});
});

describe("correlation, rate-limit, and cache propagation", () => {
	it("propagates the inbound request id and no-store headers", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		const result = await proxyToSureApi(
			baseRequest({ headers: { "X-Request-Id": "req-corr-1" } }),
			{ fetchImpl, upstreamOrigin: UPSTREAM },
		);
		expect(result.requestId).toBe("req-corr-1");
		expect(new Headers(firstCall(calls).init.headers).get("X-Request-Id")).toBe("req-corr-1");
		expect(result.headers.get("X-Request-Id")).toBe("req-corr-1");
		expect(result.headers.get("Cache-Control")).toBe("private, no-store");
		expect(result.headers.get("Vary")).toBe("Cookie, Authorization");
	});

	it("generates a correlation id when none is supplied", async () => {
		const { fetchImpl } = mockUpstream(() => jsonResponse(COLLECTION));
		const result = await proxyToSureApi(baseRequest(), {
			fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});

	it("maps 429 to rate_limited with retryAfterMs instead of retrying", async () => {
		const { fetchImpl, calls } = mockUpstream(() =>
			jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "120" }),
		);
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("rate_limited");
		expect(error.status).toBe(429);
		expect(error.retryAfterMs).toBe(120_000);
		expect(calls).toHaveLength(1);
	});
});

describe("upstream error mapping (REQ-OPS-01)", () => {
	it("preserves 4xx status with a scrubbed message", async () => {
		const { fetchImpl } = mockUpstream(() =>
			jsonResponse({ error: "unprocessable_entity", message: "Name can't be blank" }, 422),
		);
		const error = await expectBffError(
			proxyToSureApi(mutationRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("upstream");
		expect(error.status).toBe(422);
		expect(error.message).toBe("Name can't be blank");
		expect(error.toSafeBody()).toEqual({
			error: "upstream",
			message: "Name can't be blank",
			requestId: error.requestId,
		});
	});

	it("fails closed when a 5xx body breaks its contract, without secrets", async () => {
		const { fetchImpl } = mockUpstream(
			() => new Response("boom Bearer super-secret-token password= hunter2", { status: 500 }),
		);
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(502);
		expect(error.message).toBe("Upstream error failed contract validation.");
		expect(JSON.stringify(error.toSafeBody())).not.toContain("super-secret-token");
		expect(JSON.stringify(error.toSafeBody())).not.toContain("hunter2");
	});

	it("fails closed on undocumented statuses", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({ ok: true }, 418));
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(502);
		expect(calls).toHaveLength(1);
	});

	it("fails closed on malformed documented-error bodies", async () => {
		const { fetchImpl } = mockUpstream(
			() =>
				new Response("not-json{{{", {
					status: 422,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const error = await expectBffError(
			proxyToSureApi(mutationRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(502);
	});
});

describe("generated-contract upstream validation (t_alt_fnd_018)", () => {
	it("fails closed when a 200 body breaks its contract, without payload data", async () => {
		const { fetchImpl } = mockUpstream(() =>
			jsonResponse({ accounts: [{ id: 1, token: "secret-token-xyz" }] }),
		);
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(502);
		const serialized = JSON.stringify(error.toSafeBody());
		expect(serialized).not.toContain("secret-token-xyz");
	});
});

describe("credential handling (D1/REQ-SESS-01, CTL-SEC-01)", () => {
	it("attaches server credentials upstream but never echoes them back", async () => {
		const { fetchImpl } = mockUpstream(
			() =>
				new Response(JSON.stringify(COLLECTION), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": "session=upstream-secret; HttpOnly",
					},
				}),
		);
		const seen: string[] = [];
		const spying: typeof fetch = async (input, init) => {
			seen.push(new Headers(init?.headers).get("Authorization") ?? "");
			return fetchImpl(input, init);
		};
		const result = await proxyToSureApi(
			baseRequest({ auth: { bearerToken: "server-side-token" } }),
			{ fetchImpl: spying, upstreamOrigin: UPSTREAM },
		);
		expect(seen[0]).toBe("Bearer server-side-token");
		expect(result.headers.has("Set-Cookie")).toBe(false);
		expect(result.headers.has("Authorization")).toBe(false);
		expect(result.headers.has("X-Api-Key")).toBe(false);
	});

	it("supports a deployment API key without exposing it", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		await proxyToSureApi(baseRequest({ auth: { apiKey: "deploy-key" } }), {
			fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(new Headers(firstCall(calls).init.headers).get("X-Api-Key")).toBe("deploy-key");
	});

	it("reads the optional server-only SURE_API_KEY without requiring it", () => {
		// Hermetic: the accessor tolerates absence; deployment sets the var.
		expect(["string", "undefined"]).toContain(typeof getSureApiKey());
	});
});

describe("timeout, abort, and safe retries", () => {
	it("times out a hung upstream with 504 (one retry for GET)", async () => {
		const error = await expectBffError(
			proxyToSureApi(baseRequest({ timeoutMs: 15 }), {
				fetchImpl: hangingUpstream,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("timeout");
		expect(error.status).toBe(504);
	});

	it("treats a pre-aborted caller as aborted without fetching", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		const controller = new AbortController();
		controller.abort();
		const error = await expectBffError(
			proxyToSureApi(baseRequest({ signal: controller.signal }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("aborted");
		expect(error.status).toBe(499);
		expect(calls).toHaveLength(0);
	});

	it("maps a mid-flight caller abort to aborted", async () => {
		const controller = new AbortController();
		const pending = proxyToSureApi(baseRequest({ signal: controller.signal, timeoutMs: 5000 }), {
			fetchImpl: abortingUpstream,
			upstreamOrigin: UPSTREAM,
		});
		controller.abort();
		const error = await expectBffError(pending);
		expect(error.code).toBe("aborted");
	});

	it("retries an idempotent GET once on 502 then succeeds", async () => {
		let seen = 0;
		const { fetchImpl, calls } = mockUpstream(() => {
			seen += 1;
			return seen === 1 ? jsonResponse({ error: "x" }, 502) : jsonResponse(COLLECTION);
		});
		const result = await proxyToSureApi(baseRequest(), {
			fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.status).toBe(200);
		expect(result.attempts).toBe(2);
		expect(calls).toHaveLength(2);
	});

	it("gives up after exactly one retry", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({ error: "x" }, 503));
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		// 503 is undocumented for this operation: fail closed, but only
		// after the single permitted retry fired.
		expect(error.code).toBe("contract");
		expect(error.status).toBe(502);
		expect(calls).toHaveLength(2);
	});

	it("never auto-retries POST, PATCH, 4xx, or 429", async () => {
		const post = mockUpstream(() => jsonResponse({ error: "x" }, 502));
		await expectBffError(
			proxyToSureApi(mutationRequest(), {
				fetchImpl: post.fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(post.calls).toHaveLength(1);

		const notFound = mockUpstream(() => jsonResponse({ error: "missing" }, 404));
		const notFoundError = await expectBffError(
			proxyToSureApi(baseRequest({ path: `/api/v1/tags/${UUID}` }), {
				fetchImpl: notFound.fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(notFoundError.code).toBe("upstream");
		expect(notFoundError.status).toBe(404);
		expect(notFound.calls).toHaveLength(1);
	});

	it("retries a GET once after a network failure", async () => {
		let seen = 0;
		const flaky: typeof fetch = async () => {
			seen += 1;
			if (seen === 1) {
				throw new TypeError("fetch failed");
			}
			return jsonResponse(COLLECTION);
		};
		const result = await proxyToSureApi(baseRequest(), {
			fetchImpl: flaky,
			upstreamOrigin: UPSTREAM,
		});
		expect(result.status).toBe(200);
		expect(result.attempts).toBe(2);
	});
});

describe("body limits and bounded streaming", () => {
	it("rejects oversized request bodies with 413 before fetching", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(TAG, 201));
		const error = await expectBffError(
			proxyToSureApi(mutationRequest({ body: "a".repeat(BFF_MAX_REQUEST_BYTES + 1) }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(error.code).toBe("payload_too_large");
		expect(error.status).toBe(413);
		expect(calls).toHaveLength(0);
	});

	it("rejects oversized upstream responses without reading them", async () => {
		const { fetchImpl } = mockUpstream(
			() =>
				new Response("tiny", {
					status: 200,
					headers: { "Content-Length": String(BFF_MAX_RESPONSE_BYTES + 1) },
				}),
		);
		const error = await expectBffError(
			proxyToSureApi(baseRequest(), { fetchImpl, upstreamOrigin: UPSTREAM }),
		);
		expect(error.code).toBe("payload_too_large");
		expect(error.status).toBe(502);
	});

	it("buffers binary downloads with filename and content type", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const { fetchImpl } = mockUpstream(
			() =>
				new Response(bytes, {
					status: 200,
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": 'attachment; filename="export.zip"',
					},
				}),
		);
		const result = await proxyToSureApi(
			baseRequest({ path: `/api/v1/family_exports/${UUID}/download` }),
			{ fetchImpl, upstreamOrigin: UPSTREAM },
		);
		expect(result.status).toBe(200);
		expect(new Uint8Array(requireBufferBody(result.body))).toEqual(bytes);
		expect(result.headers.get("Content-Type")).toBe("application/zip");
		expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="export.zip"');
	});

	it("validates JSON before re-streaming and fails closed past the cap", async () => {
		const chunk = new Uint8Array(1024 * 1024);
		const overflowing = new ReadableStream<Uint8Array>({
			start(controller): void {
				for (let index = 0; index < 26; index += 1) {
					controller.enqueue(chunk);
				}
				controller.close();
			},
		});
		const { fetchImpl } = mockUpstream(() => new Response(overflowing, { status: 200 }));
		const overflowError = await expectBffError(
			proxyToSureApi(baseRequest({ response: "stream" }), {
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			}),
		);
		expect(overflowError.code).toBe("payload_too_large");

		const payload = JSON.stringify(COLLECTION);
		const okUpstream = mockUpstream(
			() =>
				new Response(payload, {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		const okResult = await proxyToSureApi(baseRequest({ response: "stream" }), {
			fetchImpl: okUpstream.fetchImpl,
			upstreamOrigin: UPSTREAM,
		});
		const streamed = await readAll(requireStreamBody(okResult.body));
		expect(new TextDecoder().decode(streamed)).toBe(payload);
	});

	it("forwards multipart chunk uploads with contract-valid fields", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({ data: SESSION }, 201));
		const form = new FormData();
		form.append("sequence", "1");
		form.append("raw_file_content", '{"rows":[]}\n');
		const result = await proxyToSureApi(
			{
				method: "POST",
				path: "/api/v1/import_sessions/session-1/chunks",
				origin: BFF_ORIGIN,
				csrfToken: "csrf-2",
				headers: { "Content-Type": "multipart/form-data; boundary=test-123" },
				body: form,
				bffOrigin: BFF_ORIGIN,
			},
			{ fetchImpl, upstreamOrigin: UPSTREAM },
		);
		expect(result.status).toBe(201);
		expect(new Headers(firstCall(calls).init.headers).get("Content-Type")).toBe(
			"multipart/form-data; boundary=test-123",
		);
	});

	it("rejects multipart uploads that break the generated body contract", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse({ data: SESSION }, 201));
		const form = new FormData();
		form.append("sequence", "not-a-number");
		const error = await expectBffError(
			proxyToSureApi(
				{
					method: "POST",
					path: "/api/v1/import_sessions/session-1/chunks",
					origin: BFF_ORIGIN,
					csrfToken: "csrf-3",
					headers: { "Content-Type": "multipart/form-data; boundary=test-123" },
					body: form,
					bffOrigin: BFF_ORIGIN,
				},
				{ fetchImpl, upstreamOrigin: UPSTREAM },
			),
		);
		expect(error.code).toBe("contract");
		expect(error.status).toBe(400);
		expect(calls).toHaveLength(0);
	});

	it("never sends a body on GET", async () => {
		const { fetchImpl, calls } = mockUpstream(() => jsonResponse(COLLECTION));
		await proxyToSureApi(
			baseRequest({
				body: "ignored",
				headers: { "Content-Type": "application/json" },
			}),
			{
				fetchImpl,
				upstreamOrigin: UPSTREAM,
			},
		);
		expect(firstCall(calls).init.body).toBeUndefined();
	});
});
