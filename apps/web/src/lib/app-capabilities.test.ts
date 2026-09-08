/**
 * Capability derivation tests (t_alt_fnd_010): navigation comes ONLY from
 * the server-validated BFF session status — never from client storage or
 * a locally-assumed role string.
 */
import { describe, expect, it } from "vitest";
import type { BffSessionStatus } from "./bff-auth-client";
import {
	deriveCapabilities,
	getVisibleNavItems,
	hasCapability,
	isAdminRole,
} from "./app-capabilities";

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

const SIGNED_OUT: BffSessionStatus = { authenticated: false, reason: "missing" };

describe("isAdminRole", () => {
	it("grants only server-provided admin roles", () => {
		expect(isAdminRole("admin")).toBe(true);
		expect(isAdminRole("super_admin")).toBe(true);
		expect(isAdminRole("member")).toBe(false);
		expect(isAdminRole("guest")).toBe(false);
		expect(isAdminRole(undefined)).toBe(false);
		expect(isAdminRole(null)).toBe(false);
		expect(isAdminRole("")).toBe(false);
		expect(isAdminRole("Admin")).toBe(false);
	});
});

describe("deriveCapabilities", () => {
	it("grants nothing when signed out (fail closed)", () => {
		expect(deriveCapabilities(SIGNED_OUT)).toEqual({
			"view-dashboard": false,
			"manage-settings": false,
			administer: false,
		});
	});

	it("grants authenticated capabilities without admin by default", () => {
		const capabilities = deriveCapabilities(signedIn());
		expect(capabilities["view-dashboard"]).toBe(true);
		expect(capabilities["manage-settings"]).toBe(true);
		expect(capabilities.administer).toBe(false);
	});

	it("grants administer only for server-provided admin roles", () => {
		expect(deriveCapabilities(signedIn("admin")).administer).toBe(true);
		expect(deriveCapabilities(signedIn("super_admin")).administer).toBe(true);
		expect(deriveCapabilities(signedIn("member")).administer).toBe(false);
	});

	it("checks capabilities with hasCapability", () => {
		const capabilities = deriveCapabilities(signedIn("admin"));
		expect(hasCapability(capabilities, "administer")).toBe(true);
		expect(hasCapability(deriveCapabilities(SIGNED_OUT), "view-dashboard")).toBe(false);
	});
});

describe("getVisibleNavItems", () => {
	it("shows nothing when signed out", () => {
		expect(getVisibleNavItems(deriveCapabilities(SIGNED_OUT))).toEqual([]);
	});

	it("shows dashboard + settings for members, hiding admin", () => {
		const visible = getVisibleNavItems(deriveCapabilities(signedIn("member")));
		expect(visible.map((item) => item.to)).toEqual(["/dashboard", "/settings"]);
	});

	it("shows admin only for admins (capability-derived, not role-assumed)", () => {
		const visible = getVisibleNavItems(deriveCapabilities(signedIn("admin")));
		expect(visible.map((item) => item.to)).toEqual(["/dashboard", "/settings", "/admin"]);
	});
});
