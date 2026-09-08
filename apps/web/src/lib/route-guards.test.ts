/**
 * Route-guard helper tests (t_alt_fnd_010): SSR-safe decisions for the
 * public / authenticated / settings / admin groups.
 */
import { describe, expect, it } from "vitest";
import type { BffSessionStatus } from "./bff-auth-client";
import {
	guardAuthenticated,
	guardCapability,
	loginNextFor,
	loginSearchFor,
	splitNextTarget,
	unauthorizedSearchFor,
} from "./route-guards";

function signedIn(role?: string): BffSessionStatus {
	return {
		authenticated: true,
		user: {
			id: "user-1",
			email: "member@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			uiLayout: "dashboard",
			aiEnabled: false,
			...(role === undefined ? {} : { role }),
		},
		csrfToken: "csrf-token",
	};
}

const SIGNED_OUT: BffSessionStatus = { authenticated: false, reason: "expired" };

describe("guardAuthenticated", () => {
	it("allows signed-in sessions with their capability map", () => {
		const decision = guardAuthenticated(signedIn("member"));
		expect(decision).toEqual({
			allowed: true,
			capabilities: { "view-dashboard": true, "manage-settings": true, administer: false },
		});
	});

	it("rejects signed-out sessions as unauthenticated (login redirect)", () => {
		expect(guardAuthenticated(SIGNED_OUT)).toEqual({
			allowed: false,
			reason: "unauthenticated",
		});
	});
});

describe("guardCapability", () => {
	it("allows members on dashboard, forbids admin", () => {
		expect(guardCapability(signedIn("member"), "view-dashboard").allowed).toBe(true);
		expect(guardCapability(signedIn("member"), "administer")).toEqual({
			allowed: false,
			reason: "forbidden",
		});
	});

	it("allows admins everywhere", () => {
		expect(guardCapability(signedIn("admin"), "administer").allowed).toBe(true);
	});

	it("reports unauthenticated before forbidden", () => {
		expect(guardCapability(SIGNED_OUT, "administer")).toEqual({
			allowed: false,
			reason: "unauthenticated",
		});
	});
});

describe("login redirect targets", () => {
	it("keeps safe same-origin paths, fails closed otherwise", () => {
		expect(loginNextFor("/dashboard")).toBe("/dashboard");
		expect(loginNextFor("/settings/account")).toBe("/settings/account");
		expect(loginNextFor("https://evil.example/phish")).toBe("/");
		expect(loginNextFor("//evil")).toBe("/");
	});

	it("preserves validated query strings for deep links", () => {
		expect(loginNextFor("/dashboard?q=rent&filter=active")).toBe("/dashboard?q=rent&filter=active");
		expect(loginNextFor("/dashboard?q=rent#frag")).toBe("/");
	});

	it("builds login and unauthorized search objects", () => {
		expect(loginSearchFor("/dashboard")).toEqual({ next: "/dashboard" });
		expect(loginSearchFor("/dashboard?q=rent&filter=active")).toEqual({
			next: "/dashboard?q=rent&filter=active",
		});
		expect(unauthorizedSearchFor("/admin")).toEqual({ from: "/admin" });
	});
});

describe("splitNextTarget", () => {
	it("splits pathname and decoded search for router navigation", () => {
		expect(splitNextTarget("/dashboard")).toEqual({ to: "/dashboard", search: {} });
		expect(splitNextTarget("/dashboard?q=rent&filter=active")).toEqual({
			to: "/dashboard",
			search: { q: "rent", filter: "active" },
		});
	});

	it("fails closed on unsafe input", () => {
		expect(splitNextTarget("https://evil.example/phish")).toEqual({ to: "/", search: {} });
		expect(splitNextTarget("/dashboard?q=rent#frag")).toEqual({ to: "/", search: {} });
		expect(splitNextTarget(undefined)).toEqual({ to: "/", search: {} });
	});
});
