import { describe, expect, it } from "vitest";
import {
	BFF_MAX_REQUEST_BYTES,
	BFF_REQUEST_ID_HEADER,
	BffError,
	bffErrorResponseHeaders,
	bffNoStoreHeaders,
	checkBffMutationGuards,
	coerceBffPrimitiveStrings,
	decodeBffQueryObject,
	estimateFormDataSize,
	extractUpstreamMessage,
	filterBffRequestHeaders,
	filterBffResponseHeaders,
	isIdempotentMethod,
	isRetryableUpstreamStatus,
	parseBffRetryAfterMs,
	resolveBffRequestId,
	safeUpstreamMessage,
	scrubBffSecrets,
	validateBffContentType,
	validateBffMethod,
	validateBffPath,
	validateBffQuery,
} from "./bff-policy";
import type { BffPathOk } from "./bff-policy";

function requirePath(rawPath: string): BffPathOk {
	const result = validateBffPath(rawPath);
	if (!result.ok) {
		throw new Error(`Expected ${rawPath} to be allow-listed (${result.code}).`);
	}
	return result;
}

// REQ-TRAN-03 / T-SSRF: the BFF must never become a proxy to arbitrary
// upstreams. Every input below must be rejected before any fetch happens.
describe("validateBffPath SSRF defenses", () => {
	it.each([
		"https://evil.example.com/api/v1/accounts",
		"http://localhost:3000/api/v1/accounts",
		"http://169.254.169.254/latest/meta-data",
		"//evil.example.com/api/v1/accounts",
		"javascript:alert(1)",
		"data:text/plain,hi",
		"/api/v1/accounts?admin=true",
		"/api/v1/accounts#fragment",
		"/api/v1/accounts\\..\\..\\etc",
		"\\api\\v1\\accounts",
		"/api/v1/../admin",
		"/api/v1/./accounts",
		"/api/v1/accounts/",
		"/api/v1//accounts",
		"/api/v1/%2e%2e/admin",
		"/api/v1/%2E%2E/admin",
		"/api/v1/accounts%2fadmin",
		"/api/v1/accounts%5cadmin",
		"/api/v1/accounts%2Fadmin",
		"/api/v1/accounts%ZZ",
		"/api/v1/accounts with space",
		"/api/v1/accounts\t",
		"/api/v1/accounts\n",
		"/api/v1/accounts\0",
		"/oauth/token",
		"/api/v2/accounts",
		"/api/v1-evil/accounts",
		"/api/v1/",
		"/",
		"",
		"/api/v1/nope",
		"/api/v1/accounts/extra/segment",
	])("rejects %j", (rawPath) => {
		expect(validateBffPath(rawPath)).toMatchObject({ ok: false, code: "bad_path" });
	});

	it("rejects non-string and over-long paths", () => {
		expect(validateBffPath(undefined).ok).toBe(false);
		expect(validateBffPath(null).ok).toBe(false);
		expect(validateBffPath(42).ok).toBe(false);
		expect(validateBffPath(`/api/v1/${"a".repeat(2100)}`).ok).toBe(false);
	});

	it("accepts allow-listed literals with their documented methods", () => {
		expect(validateBffPath("/api/v1/accounts")).toEqual({
			ok: true,
			path: "/api/v1/accounts",
			methods: ["GET", "POST"],
			template: "/api/v1/accounts",
			pathParams: {},
		});
	});

	it("resolves templates and decodes path params for contract lookup", () => {
		expect(validateBffPath("/api/v1/tags/tag-1")).toEqual({
			ok: true,
			path: "/api/v1/tags/tag-1",
			methods: ["GET", "PATCH", "DELETE"],
			template: "/api/v1/tags/{id}",
			pathParams: { id: "tag-1" },
		});
		expect(validateBffPath("/api/v1/accounts/%41")).toMatchObject({
			ok: true,
			template: "/api/v1/accounts/{id}",
			pathParams: { id: "A" },
		});
	});

	it("accepts parameter segments and prefers exact literals", () => {
		const param = validateBffPath("/api/v1/tags/tag-1");
		expect(param.ok).toBe(true);

		// /syncs/latest is an exact literal AND matches /syncs/{id}: the
		// literal must win (both are GET here, so assert the literal source
		// resolves rather than 404ing).
		const latest = validateBffPath("/api/v1/syncs/latest");
		expect(latest.ok).toBe(true);

		const download = validateBffPath("/api/v1/family_exports/export-1/download");
		expect(download.ok).toBe(true);
	});

	it("accepts benign percent-encoding inside a parameter segment", () => {
		// %41 decodes to "A": no escape, single segment, still allow-listed.
		expect(validateBffPath("/api/v1/accounts/%41").ok).toBe(true);
	});
});

describe("validateBffMethod", () => {
	it("rejects non-allow-listed methods", () => {
		for (const method of ["TRACE", "OPTIONS", "HEAD", "CONNECT", "get", "", undefined]) {
			const result = validateBffMethod(method, ["GET"]);
			expect(result.ok).toBe(false);
		}
	});

	it("rejects valid methods the route does not document", () => {
		// /balance_sheet documents GET only: POST must 405, never proxied.
		const balanceMethods = requirePath("/api/v1/balance_sheet").methods;
		expect(validateBffMethod("POST", balanceMethods)).toMatchObject({ ok: false });
		expect(validateBffMethod("GET", balanceMethods)).toMatchObject({
			ok: true,
			method: "GET",
		});
		// PUT exists as a method but no route documents it: always rejected.
		const accountMethods = requirePath("/api/v1/accounts").methods;
		expect(validateBffMethod("PUT", accountMethods)).toMatchObject({ ok: false });
	});
});

describe("validateBffContentType", () => {
	it("needs no content type without a body", () => {
		expect(validateBffContentType(null, false)).toEqual({
			ok: true,
			contentType: undefined,
		});
	});

	it("accepts the documented JSON and multipart types", () => {
		expect(validateBffContentType("application/json", true).ok).toBe(true);
		expect(validateBffContentType("Application/JSON; charset=utf-8", true).ok).toBe(true);
		expect(validateBffContentType("multipart/form-data; boundary=xyz", true).ok).toBe(true);
	});

	it("rejects missing or exotic content types for bodies", () => {
		for (const value of ["", "text/html", "application/xml", "application/octet-stream", null]) {
			const result = validateBffContentType(value, true);
			expect(result.ok).toBe(false);
		}
	});
});

describe("validateBffQuery", () => {
	it("passes empty queries through", () => {
		expect(validateBffQuery(undefined)).toEqual({ ok: true, query: "" });
		expect(validateBffQuery("")).toEqual({ ok: true, query: "" });
	});

	it("normalizes a leading question mark", () => {
		expect(validateBffQuery("?page=2&per_page=25")).toEqual({
			ok: true,
			query: "?page=2&per_page=25",
		});
		expect(validateBffQuery("page=2")).toEqual({ ok: true, query: "?page=2" });
	});

	it("rejects over-long, smuggled, or non-string queries", () => {
		expect(validateBffQuery(`?${"a".repeat(5000)}`).ok).toBe(false);
		expect(validateBffQuery("?a=1\r\nX-Injected: yes").ok).toBe(false);
		expect(validateBffQuery("?a=1#frag").ok).toBe(false);
		expect(validateBffQuery(42).ok).toBe(false);
	});
});

describe("contract wire decoding", () => {
	it("decodes query strings to objects with arrays for repeats", () => {
		expect(decodeBffQueryObject("?page=2&per_page=25")).toEqual({
			page: "2",
			per_page: "25",
		});
		expect(decodeBffQueryObject("tag=a&tag=b")).toEqual({ tag: ["a", "b"] });
		expect(decodeBffQueryObject("")).toEqual({});
	});

	it("coerces primitive-looking strings without touching the rest", () => {
		expect(
			coerceBffPrimitiveStrings({ page: "2", flag: "true", name: "Cash", file: null }),
		).toEqual({ page: 2, flag: true, name: "Cash", file: null });
		expect(coerceBffPrimitiveStrings(["1", "x"])).toEqual([1, "x"]);
		expect(coerceBffPrimitiveStrings("007")).toBe(7);
		expect(coerceBffPrimitiveStrings("abc")).toBe("abc");
		expect(coerceBffPrimitiveStrings(new Blob(["b"]))).toBeInstanceOf(Blob);
	});
});

describe("multipart aggregate sizing", () => {
	it("accounts field names, string bytes, Blob sizes, and overhead", () => {
		const form = new FormData();
		form.append("sequence", "1");
		form.append("file", new Blob(["abc"]));
		// 1024 total + ("sequence"=8 + 512 + "1"=1) + ("file"=4 + 512 + 3
		// + File name "blob"=4 + MIME ""=0: FormData normalizes Blob parts
		// to Files named "blob").
		expect(estimateFormDataSize(form)).toBe(1024 + 8 + 512 + 1 + 4 + 512 + 3 + 4);
	});

	it("counts filenames and MIME types alongside payload sizes", () => {
		const form = new FormData();
		form.append("file", new File(["abc"], "a.csv", { type: "text/csv" }));
		// 1024 total + ("file"=4 + 512 + payload 3 + filename "a.csv"=5 +
		// MIME "text/csv"=8).
		expect(estimateFormDataSize(form)).toBe(1024 + 4 + 512 + 3 + 5 + 8);
	});

	it("never undershoots wire bytes for filename-heavy parts", async () => {
		const form = new FormData();
		form.append(
			"file",
			new File([new Uint8Array(0)], `${"n".repeat(100_000)}.csv`, { type: "text/csv" }),
		);
		const wire = new Request("https://bff.test/api/v1/merchants/import", {
			method: "POST",
			body: form,
		});
		const actual = (await wire.arrayBuffer()).byteLength;
		// Zero payload bytes, yet the filename alone serializes ~100KiB of framing.
		expect(actual).toBeGreaterThan(100_000);
		expect(estimateFormDataSize(form)).toBeGreaterThanOrEqual(actual);
	});

	it("never undershoots wire bytes for MIME metadata", async () => {
		const mime = "application/x-custom-type".repeat(10);
		const form = new FormData();
		form.append("file", new File([new Uint8Array([1, 2, 3])], "data.bin", { type: mime }));
		const wire = new Request("https://bff.test/api/v1/merchants/import", {
			method: "POST",
			body: form,
		});
		const actual = (await wire.arrayBuffer()).byteLength;
		expect(actual).toBeGreaterThan(mime.length);
		expect(estimateFormDataSize(form)).toBeGreaterThanOrEqual(actual);
	});

	it("flags aggregates over the request cap", () => {
		const form = new FormData();
		form.append("file", new Blob([new Uint8Array(BFF_MAX_REQUEST_BYTES + 1)]));
		expect(estimateFormDataSize(form)).toBeGreaterThan(BFF_MAX_REQUEST_BYTES);
	});
});

describe("error retry metadata", () => {
	it("carries retryAfterMs in the safe body and header adapter", () => {
		const error = new BffError({
			code: "rate_limited",
			status: 429,
			message: "Rate limit exceeded. Retry later.",
			requestId: "req-retry-1",
			retryAfterMs: 120_000,
		});
		expect(error.toSafeBody()).toEqual({
			error: "rate_limited",
			message: "Rate limit exceeded. Retry later.",
			requestId: "req-retry-1",
			retryAfterMs: 120_000,
		});
		const headers = bffErrorResponseHeaders(error);
		expect(headers.get("Retry-After")).toBe("120");
		expect(headers.get(BFF_REQUEST_ID_HEADER)).toBe("req-retry-1");
		expect(headers.get("Cache-Control")).toBe("private, no-store");
	});

	it("omits Retry-After when the error carries none", () => {
		const error = new BffError({ code: "timeout", status: 504, message: "Upstream timed out." });
		expect(error.toSafeBody()).toEqual({ error: "timeout", message: "Upstream timed out." });
		expect(bffErrorResponseHeaders(error).has("Retry-After")).toBe(false);
	});
});

describe("filterBffRequestHeaders", () => {
	it("forwards only allow-listed metadata and strips spoofable headers", () => {
		const inbound = new Headers({
			Accept: "application/json",
			"Accept-Language": "en",
			"Content-Type": "application/json",
			"X-Request-Id": "req-1",
			Cookie: "session=abc",
			Authorization: "Bearer secret",
			"X-Api-Key": "key",
			"X-Forwarded-Host": "evil.example.com",
			"X-Forwarded-Proto": "https",
			"X-Forwarded-For": "1.2.3.4",
			Forwarded: "for=1.2.3.4",
			"X-Real-Ip": "1.2.3.4",
			Host: "evil.example.com",
			Connection: "keep-alive",
		});
		const filtered = filterBffRequestHeaders(inbound);
		expect(filtered.get("Accept")).toBe("application/json");
		expect(filtered.get("X-Request-Id")).toBe("req-1");
		for (const name of [
			"Cookie",
			"Authorization",
			"X-Api-Key",
			"X-Forwarded-Host",
			"X-Forwarded-Proto",
			"X-Forwarded-For",
			"Forwarded",
			"X-Real-Ip",
			"Host",
			"Connection",
		]) {
			expect(filtered.has(name)).toBe(false);
		}
	});
});

// REQ-TRAN-01 / T-CSRF: mutations need same-origin + anti-CSRF token;
// state-changing GETs must not exist (only GET is side-effect free here).
describe("checkBffMutationGuards", () => {
	it("lets safe GETs through without origin or token", () => {
		expect(
			checkBffMutationGuards({
				method: "GET",
				origin: undefined,
				csrfToken: undefined,
				bffOrigin: "https://app.example.com",
			}),
		).toEqual({ ok: true });
	});

	it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
		"requires same-origin plus a CSRF token for %s",
		(method) => {
			const base = { method, bffOrigin: "https://app.example.com" } as const;
			expect(checkBffMutationGuards({ ...base, origin: undefined, csrfToken: "t" }).ok).toBe(false);
			expect(
				checkBffMutationGuards({ ...base, origin: "https://evil.example.com", csrfToken: "t" }).ok,
			).toBe(false);
			expect(
				checkBffMutationGuards({
					...base,
					origin: "https://app.example.com",
					csrfToken: "   ",
				}).ok,
			).toBe(false);
			expect(
				checkBffMutationGuards({
					...base,
					origin: "https://app.example.com",
					csrfToken: "token-1",
				}),
			).toEqual({ ok: true });
		},
	);
});

// REQ-TRAN-05 / T-CACHE: personalized data must never be shared-cached.
describe("bffNoStoreHeaders", () => {
	it("marks every BFF response private and no-store", () => {
		const headers = bffNoStoreHeaders();
		expect(headers["Cache-Control"]).toBe("private, no-store");
		expect(headers["Vary"]).toBe("Cookie, Authorization");
	});
});

describe("filterBffResponseHeaders", () => {
	it("propagates status/rate-limit/correlation metadata only", () => {
		const upstream = new Headers({
			"Content-Type": "application/zip",
			"Content-Disposition": 'attachment; filename="export.zip"',
			"Retry-After": "30",
			"X-Request-Id": "req-9",
			"RateLimit-Remaining": "42",
			"Set-Cookie": "session=upstream-secret; HttpOnly",
			Server: "puma",
			"X-Powered-By": "rails",
			Authorization: "Bearer secret",
		});
		const filtered = filterBffResponseHeaders(upstream);
		expect(filtered.get("Content-Type")).toBe("application/zip");
		expect(filtered.get("Content-Disposition")).toBe('attachment; filename="export.zip"');
		expect(filtered.get("Retry-After")).toBe("30");
		expect(filtered.get("X-Request-Id")).toBe("req-9");
		// D1/REQ-SESS-01: upstream cookies must never reach the browser.
		expect(filtered.has("Set-Cookie")).toBe(false);
		expect(filtered.has("Server")).toBe(false);
		expect(filtered.has("Authorization")).toBe(false);
	});
});

describe("correlation and retry helpers", () => {
	it("prefers the inbound request id and otherwise generates one", () => {
		const inbound = new Headers({ [BFF_REQUEST_ID_HEADER]: "req-in-1" });
		expect(resolveBffRequestId(inbound)).toBe("req-in-1");
		const generated = resolveBffRequestId(new Headers());
		expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	it("parses Retry-After seconds and dates", () => {
		expect(parseBffRetryAfterMs("120")).toBe(120_000);
		expect(parseBffRetryAfterMs("not-a-date")).toBeUndefined();
		expect(parseBffRetryAfterMs(null)).toBeUndefined();
	});

	it("marks only idempotent methods and gateway statuses retryable", () => {
		expect(isIdempotentMethod("GET")).toBe(true);
		expect(isIdempotentMethod("PUT")).toBe(true);
		expect(isIdempotentMethod("DELETE")).toBe(true);
		expect(isIdempotentMethod("POST")).toBe(false);
		expect(isIdempotentMethod("PATCH")).toBe(false);
		expect(isRetryableUpstreamStatus(502)).toBe(true);
		expect(isRetryableUpstreamStatus(503)).toBe(true);
		expect(isRetryableUpstreamStatus(504)).toBe(true);
		expect(isRetryableUpstreamStatus(429)).toBe(false);
		expect(isRetryableUpstreamStatus(500)).toBe(false);
	});
});

// REQ-OPS-01 / T-LOG + CTL-SEC-01: errors are structured and redacted.
describe("redacted errors", () => {
	it("scrubs credential-shaped material", () => {
		const scrubbed = scrubBffSecrets(
			"failed with Bearer abc.def.ghi and api_key: super-secret-ok password= hunter2",
		);
		expect(scrubbed).not.toContain("abc.def.ghi");
		expect(scrubbed).not.toContain("super-secret-ok");
		expect(scrubbed).not.toContain("hunter2");
		expect(scrubBffSecrets("plain validation message")).toBe("plain validation message");
	});

	it("hides 5xx bodies but keeps scrubbed 4xx hints", () => {
		expect(safeUpstreamMessage(500, "Bearer leak SQL stack")).toBe(
			"Upstream request failed with status 500.",
		);
		expect(
			safeUpstreamMessage(422, '{"error":"unprocessable_entity","message":"Name can\'t be blank"}'),
		).toBe("Name can't be blank");
		expect(safeUpstreamMessage(422, "x Bearer abc ok")).not.toContain("abc");
	});

	it("extracts ErrorResponse messages from JSON bodies", () => {
		expect(extractUpstreamMessage('{"message":"Nope","error":"x"}')).toBe("Nope");
		expect(extractUpstreamMessage('{"error":"gone"}')).toBe("gone");
		expect(extractUpstreamMessage("plain text")).toBe("plain text");
		expect(extractUpstreamMessage("{not json")).toBe("{not json");
	});

	it("serializes BffError to a safe body without internals", () => {
		const error = new BffError({
			code: "upstream",
			status: 502,
			message: "Upstream request failed with status 502.",
			requestId: "req-safe-1",
		});
		expect(error.toSafeBody()).toEqual({
			error: "upstream",
			message: "Upstream request failed with status 502.",
			requestId: "req-safe-1",
		});
		expect(JSON.stringify(error.toSafeBody())).not.toContain("stack");
	});
});
