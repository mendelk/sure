// Unit tests for the pure e2e redirect helpers (apps/web, vitest only).
//
// `assertLoginNextPath` pins exact login-redirect pathnames: a
// prefix match would let `/dashboard-evil` pass, so these cases lock
// the exact-pathname behavior (normalized query parameters allowed).
import { describe, expect, it } from "vitest";
import {
	BFF_CSRF_COOKIE_NAME,
	BFF_SESSION_COOKIE_NAME,
	assertLoginNextPath,
	loginNextTarget,
} from "./e2e-helpers.mjs";

const WEB = "http://127.0.0.1:4173";

describe("loginNextTarget", () => {
	it("parses the bare and normalized dashboard targets", () => {
		expect(loginNextTarget(`${WEB}/login?next=/dashboard`).pathname).toBe("/dashboard");
		expect(
			loginNextTarget(`${WEB}/login?next=${encodeURIComponent("/dashboard?q=&filter=all")}`)
				.pathname,
		).toBe("/dashboard");
	});

	it("rejects non-login pages, missing next, and non-relative targets", () => {
		expect(() => loginNextTarget(`${WEB}/dashboard`)).toThrow(/expected \/login/);
		expect(() => loginNextTarget(`${WEB}/login`)).toThrow(/safe same-origin/);
		expect(() => loginNextTarget(`${WEB}/login?next=https://evil.example/x`)).toThrow(
			/safe same-origin/,
		);
		expect(() => loginNextTarget(`${WEB}/login?next=//evil.example/x`)).toThrow(/safe same-origin/);
	});
});

describe("assertLoginNextPath", () => {
	it("accepts the dashboard with normalized query parameters", () => {
		expect(() =>
			assertLoginNextPath(
				`${WEB}/login?next=${encodeURIComponent("/dashboard?q=&filter=all")}`,
				"/dashboard",
			),
		).not.toThrow();
	});

	it("rejects lookalike paths even with matching query", () => {
		expect(() =>
			assertLoginNextPath(
				`${WEB}/login?next=${encodeURIComponent("/dashboard-evil?q=&filter=all")}`,
				"/dashboard",
			),
		).toThrow(/"\/dashboard-evil"/);
		expect(() => assertLoginNextPath(`${WEB}/login?next=/dashboard-evil`, "/dashboard")).toThrow(
			/"\/dashboard-evil"/,
		);
	});
});

describe("BFF cookie names", () => {
	it("pins the hardened session/CSRF names from bff-session.ts", () => {
		expect(BFF_SESSION_COOKIE_NAME).toBe("__Host-sure-bff-session");
		expect(BFF_CSRF_COOKIE_NAME).toBe("__Host-sure-bff-csrf");
	});
});
