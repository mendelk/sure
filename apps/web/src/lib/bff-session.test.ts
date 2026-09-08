/**
 * Pure BFF session policy tests (t_alt_fnd_007, ADR-0001 session and redirect requirements).
 *
 * Covers cookie attributes (REQ-SESS-03), strict session-id parsing
 * (REQ-SESS-04 fail-closed), the same-origin `next` allow-list
 * (REQ-TRAN-04), and the session-bound CSRF comparison in
 * `checkBffMutationGuards` (REQ-TRAN-01).
 */
import { describe, expect, it } from "vitest";
import {
	BFF_CSRF_COOKIE_NAME,
	BFF_SESSION_ABSOLUTE_LIFETIME_MS,
	BFF_SESSION_CLOCK_SKEW_MS,
	BFF_SESSION_COOKIE_NAME,
	BFF_SESSION_IDLE_TIMEOUT_MS,
	bffCsrfCookieAttributes,
	bffSessionCookieAttributes,
	parseBffCsrfCookie,
	parseBffSessionId,
	resolveSafeNext,
} from "./bff-session";
import { checkBffMutationGuards, constantTimeEqual } from "./bff-policy";

const BFF_ORIGIN = "https://bff.test";

describe("bff session cookie policy (REQ-SESS-01/03)", () => {
	it("names the opaque session cookie with a __Host- prefix", () => {
		expect(BFF_SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
		expect(BFF_CSRF_COOKIE_NAME.startsWith("__Host-")).toBe(true);
	});

	it("locks the session cookie down (HttpOnly, Secure, Lax, host-only, idle Max-Age)", () => {
		const attrs = bffSessionCookieAttributes();
		expect(attrs).toEqual({
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			path: "/",
			maxAge: BFF_SESSION_IDLE_TIMEOUT_MS / 1000,
		});
		// Host-only: no Domain attribute exists on the shape at all.
		expect("domain" in attrs).toBe(false);
	});

	it("keeps the CSRF cookie readable by JS but otherwise locked down", () => {
		const attrs = bffCsrfCookieAttributes();
		expect(attrs.httpOnly).toBe(false);
		expect(attrs.secure).toBe(true);
		expect(attrs.sameSite).toBe("lax");
		expect(attrs.path).toBe("/");
	});

	it("bounds lifetimes at or below the refresh-token lifetime (REQ-SESS-02)", () => {
		expect(BFF_SESSION_IDLE_TIMEOUT_MS).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
		expect(BFF_SESSION_ABSOLUTE_LIFETIME_MS).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
		expect(BFF_SESSION_ABSOLUTE_LIFETIME_MS).toBeGreaterThan(BFF_SESSION_IDLE_TIMEOUT_MS);
		expect(BFF_SESSION_CLOCK_SKEW_MS).toBeLessThanOrEqual(60 * 1000);
	});
});

describe("parseBffSessionId (REQ-SESS-04 fail closed)", () => {
	const valid = "AbcDef0123456789_-Ab12";

	it("accepts a well-formed opaque id", () => {
		expect(parseBffSessionId(`${BFF_SESSION_COOKIE_NAME}=${valid}; other=1`)).toBe(valid);
	});

	it.each([null, undefined, "", "other=1", `${BFF_SESSION_COOKIE_NAME}=`])(
		"rejects missing/empty cookies (%p)",
		(header: string | null | undefined) => {
			expect(parseBffSessionId(header)).toBeUndefined();
		},
	);

	it("rejects duplicate session cookies", () => {
		expect(
			parseBffSessionId(`${BFF_SESSION_COOKIE_NAME}=${valid}; ${BFF_SESSION_COOKIE_NAME}=${valid}`),
		).toBeUndefined();
	});

	it.each(["short", "has spaces in it ok", "with/slash", "with+plus", "Bearer abc.def.ghi"])(
		"rejects non-opaque shapes (%p)",
		(value) => {
			expect(parseBffSessionId(`${BFF_SESSION_COOKIE_NAME}=${value}`)).toBeUndefined();
		},
	);
});

describe("parseBffCsrfCookie", () => {
	it("reads the readable CSRF cookie", () => {
		expect(parseBffCsrfCookie(`${BFF_CSRF_COOKIE_NAME}=token-1; other=2`)).toBe("token-1");
		expect(parseBffCsrfCookie("other=2")).toBeUndefined();
	});
});

describe("resolveSafeNext (REQ-TRAN-04)", () => {
	it("preserves legit same-origin relative targets", () => {
		expect(resolveSafeNext("/accounts")).toBe("/accounts");
		expect(resolveSafeNext("/settings/profile")).toBe("/settings/profile");
	});

	it("preserves validated query strings so deep links keep typed search state", () => {
		expect(resolveSafeNext("/dashboard?q=rent&filter=active")).toBe(
			"/dashboard?q=rent&filter=active",
		);
		expect(resolveSafeNext("/settings?section=account")).toBe("/settings?section=account");
		expect(resolveSafeNext("/dashboard?q=100%25")).toBe("/dashboard?q=100%25");
		// An empty query collapses to the pathname.
		expect(resolveSafeNext("/dashboard?")).toBe("/dashboard");
	});

	it.each([
		"//evil.test/x",
		"https://evil.test/",
		"javascript:alert(1)",
		"/\\evil",
		"/a/../b",
		"/./b",
		"/a//b",
		"/a/",
		"/a#frag",
		"/a?x=1#frag",
		"/a?x=a#b",
		"/a?x=a\\b",
		"/a?q=%E0%A4%A",
		"/a?\t",
		"/%2Fevil",
		"/%5cevil",
		"/a%00b",
		"",
		"relative",
	])("rejects %p to /", (raw) => {
		expect(resolveSafeNext(raw)).toBe("/");
	});

	it("rejects overlong targets to /", () => {
		expect(resolveSafeNext(`/${"a".repeat(2048)}?q=1`)).toBe("/");
		expect(resolveSafeNext(`/${"a".repeat(2048)}`)).toBe("/");
		expect(resolveSafeNext(`/${"a".repeat(2046)}`)).toBe(`/${"a".repeat(2046)}`);
	});

	it.each([undefined, null, 42, {}, ["/x"]])("rejects non-strings %p to /", (raw) => {
		expect(resolveSafeNext(raw)).toBe("/");
	});
});

describe("checkBffMutationGuards session binding (REQ-TRAN-01)", () => {
	it("accepts the session-bound token", () => {
		expect(
			checkBffMutationGuards({
				method: "POST",
				origin: BFF_ORIGIN,
				csrfToken: "session-token",
				bffOrigin: BFF_ORIGIN,
				expectedCsrfToken: "session-token",
			}),
		).toEqual({ ok: true });
	});

	it("rejects another session's token", () => {
		expect(
			checkBffMutationGuards({
				method: "POST",
				origin: BFF_ORIGIN,
				csrfToken: "attacker-session-token",
				bffOrigin: BFF_ORIGIN,
				expectedCsrfToken: "victim-session-token",
			}),
		).toEqual({ ok: false, code: "csrf", message: "Invalid anti-CSRF token." });
	});

	it("keeps the transport floor (presence + origin) without a session", () => {
		expect(
			checkBffMutationGuards({
				method: "POST",
				origin: BFF_ORIGIN,
				csrfToken: "anything",
				bffOrigin: BFF_ORIGIN,
			}),
		).toEqual({ ok: true });
	});

	it("leaves safe GETs untouched even with a binding configured", () => {
		expect(
			checkBffMutationGuards({
				method: "GET",
				origin: undefined,
				csrfToken: undefined,
				bffOrigin: BFF_ORIGIN,
				expectedCsrfToken: "session-token",
			}),
		).toEqual({ ok: true });
	});
});

describe("constantTimeEqual", () => {
	it("compares without leaking the shared prefix", () => {
		expect(constantTimeEqual("abc", "abc")).toBe(true);
		expect(constantTimeEqual("abc", "abd")).toBe(false);
		expect(constantTimeEqual("abc", "abcd")).toBe(false);
		expect(constantTimeEqual("", "")).toBe(true);
	});
});
