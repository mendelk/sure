// Unit tests for the pure e2e configuration (apps/web, vitest only).
import { describe, expect, it } from "vitest";
import {
	E2E_THEMES,
	E2E_VIEWPORTS,
	E2E_DEFAULTS,
	SENSITIVE_MASK_SELECTORS,
	resolveE2EConfig,
	roleCredentials,
} from "./e2e-config.mjs";

describe("resolveE2EConfig", () => {
	it("pins services to loopback with CI-friendly defaults", () => {
		const config = resolveE2EConfig({}, "/web");
		expect(config.railsOrigin).toBe(`http://127.0.0.1:${E2E_DEFAULTS.railsPort}`);
		expect(config.webOrigin).toBe(`http://127.0.0.1:${E2E_DEFAULTS.webPort}`);
		expect(config.artifactsDir).toBe("/web/test-results/e2e");
	});

	it("honors port and credential overrides", () => {
		const config = resolveE2EConfig(
			{
				SURE_E2E_RAILS_PORT: "3200",
				SURE_E2E_WEB_PORT: "4200",
				SURE_E2E_EMAIL: "someone@example.com",
			},
			"/web",
		);
		expect(config.railsOrigin).toBe("http://127.0.0.1:3200");
		expect(config.webOrigin).toBe("http://127.0.0.1:4200");
		expect(config.email).toBe("someone@example.com");
	});

	it("rejects invalid ports and non-loopback origins", () => {
		expect(() => resolveE2EConfig({ SURE_E2E_RAILS_PORT: "banana" }, "/web")).toThrow(
			/invalid port/,
		);
		expect(() =>
			resolveE2EConfig({ SURE_E2E_RAILS_ORIGIN: "http://example.com:3101" }, "/web"),
		).toThrow(/loopback/);
	});
});

describe("roles and matrices", () => {
	it("maps member/viewer roles to distinct seeded emails", () => {
		const config = resolveE2EConfig({}, "/web");
		const member = roleCredentials(config, "member");
		const viewer = roleCredentials(config, "viewer");
		expect(member.email).not.toBe(viewer.email);
		expect(member.password).toBe(viewer.password);
		expect(() => roleCredentials(config, "super_admin")).toThrow(/unknown role/);
	});

	it("covers mobile viewports and both themes", () => {
		expect(E2E_VIEWPORTS.mobile.width).toBeLessThan(E2E_VIEWPORTS.desktop.width);
		expect([...E2E_THEMES].toSorted()).toEqual(["dark", "light"]);
	});
});

describe("privacy masking", () => {
	it("always masks the sensitive convention selector", () => {
		expect(SENSITIVE_MASK_SELECTORS).toContain("[data-sensitive]");
		expect(SENSITIVE_MASK_SELECTORS.length).toBeGreaterThan(0);
	});
});
