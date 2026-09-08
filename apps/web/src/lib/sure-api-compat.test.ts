/**
 * Sure API compatibility policy tests (`t_alt_fnd_015`).
 *
 * Covers the client-safe decision layer: supported versions report
 * `ready`, older/newer contracts report `too-old`/`too-new`, supported
 * versions missing a required capability report `missing-capability` with
 * the absent tokens, unrecognised versions fail closed, and every message
 * stays actionable with no API-origin leakage.
 */
import { describe, expect, it } from "vitest";
import {
	describeApiCompatibility,
	evaluateApiCompatibility,
	parseApiVersion,
	REQUIRED_API_CAPABILITIES,
	SURE_API_SUPPORTED_MAJOR,
	SURE_API_SUPPORTED_MIN,
} from "./sure-api-compat";

const FULL_CAPABILITIES = [...REQUIRED_API_CAPABILITIES];

describe("compatibility policy", () => {
	it("pins the supported contract to major version 1 from 1.0.0", () => {
		expect(SURE_API_SUPPORTED_MAJOR).toBe(1);
		expect(SURE_API_SUPPORTED_MIN).toBe("1.0.0");
	});

	it("reports ready for supported versions with full capabilities", () => {
		for (const apiVersion of ["1.0.0", "1.2.3", "1.99.99"]) {
			expect(evaluateApiCompatibility({ apiVersion, capabilities: FULL_CAPABILITIES })).toEqual({
				state: "ready",
				serverVersion: apiVersion,
			});
		}
	});

	it("reports too-old for contracts below the supported range", () => {
		for (const apiVersion of ["0.9.9", "0.1.0"]) {
			const decision = evaluateApiCompatibility({ apiVersion, capabilities: FULL_CAPABILITIES });
			expect(decision.state).toBe("too-old");
			expect(decision.serverVersion).toBe(apiVersion);
		}
	});

	it("reports too-new for contracts above the supported major", () => {
		for (const apiVersion of ["2.0.0", "10.1.0"]) {
			const decision = evaluateApiCompatibility({ apiVersion, capabilities: FULL_CAPABILITIES });
			expect(decision.state).toBe("too-new");
			expect(decision.serverVersion).toBe(apiVersion);
		}
	});

	it("reports missing-capability with the absent tokens", () => {
		const decision = evaluateApiCompatibility({
			apiVersion: "1.0.0",
			capabilities: ["auth.login"],
		});
		expect(decision.state).toBe("missing-capability");
		expect(decision.missingCapabilities).toEqual(["auth.refresh", "auth.logout"]);
	});

	it("prefers the version decision over capabilities", () => {
		expect(evaluateApiCompatibility({ apiVersion: "0.9.0", capabilities: [] }).state).toBe(
			"too-old",
		);
		expect(evaluateApiCompatibility({ apiVersion: "2.0.0", capabilities: [] }).state).toBe(
			"too-new",
		);
	});

	it("fails closed as too-new for unrecognised versions", () => {
		for (const apiVersion of ["", "v1", "1.0", "1.0.0-beta", "latest", "1.0.0.0"]) {
			expect(evaluateApiCompatibility({ apiVersion, capabilities: FULL_CAPABILITIES }).state).toBe(
				"too-new",
			);
		}
	});

	it("truncates server-controlled version display", () => {
		const long = `1.0.0-${"x".repeat(200)}`;
		const decision = evaluateApiCompatibility({ apiVersion: long, capabilities: [] });
		expect(decision.serverVersion?.length).toBeLessThanOrEqual(32);
	});
});

describe("parseApiVersion", () => {
	it("parses strict semver triples", () => {
		expect(parseApiVersion("1.0.0")).toEqual([1, 0, 0]);
		expect(parseApiVersion("1.12.3")).toEqual([1, 12, 3]);
	});

	it("rejects non-triples", () => {
		for (const raw of ["", "1", "1.0", "v1.0.0", "1.0.0-rc.1", "one.two.three"]) {
			expect(parseApiVersion(raw)).toBeUndefined();
		}
	});
});

describe("describeApiCompatibility", () => {
	it("gives every blocking state an actionable message", () => {
		const details = {
			unreachable: describeApiCompatibility({ state: "unreachable" }).detail,
			unauthenticated: describeApiCompatibility({ state: "unauthenticated" }).detail,
			"too-old": describeApiCompatibility({ state: "too-old", serverVersion: "0.9.0" }).detail,
			"too-new": describeApiCompatibility({ state: "too-new", serverVersion: "2.0.0" }).detail,
			"missing-capability": describeApiCompatibility({
				state: "missing-capability",
				serverVersion: "1.0.0",
				missingCapabilities: ["auth.logout"],
			}).detail,
		};
		expect(details["unreachable"]).toMatch(/try again/i);
		expect(details["unauthenticated"]).toMatch(/administrator/i);
		expect(details["too-old"]).toMatch(/upgrade the Sure server/i);
		expect(details["too-new"]).toMatch(/update the web app/i);
		expect(details["missing-capability"]).toMatch(/auth\.logout/);
	});

	it("never leaks API origins in titles or details", () => {
		const origin = "http://internal-sure-api.test:3000";
		const states = [
			{ state: "ready", serverVersion: "1.0.0" },
			{ state: "unreachable" },
			{ state: "unauthenticated" },
			{ state: "too-old", serverVersion: "0.9.0" },
			{ state: "too-new", serverVersion: "2.0.0" },
			{
				state: "missing-capability",
				serverVersion: "1.0.0",
				missingCapabilities: ["auth.logout"],
			},
		] as const;
		for (const compatibility of states) {
			const message = describeApiCompatibility(compatibility);
			expect(`${message.title} ${message.detail}`).not.toContain(origin);
		}
	});
});
