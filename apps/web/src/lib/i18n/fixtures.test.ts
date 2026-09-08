// Pseudolocale + long-text fixture tests (t_alt_fnd_011).
//
// Fixtures prove layouts survive translations that have not shipped:
// pseudolocales expand and accent copy while preserving `{placeholders}`,
// and long-text entries exercise wrapping/overflow paths.
import { describe, expect, it } from "vitest";
import { LONG_TEXT_FIXTURES, pseudolocalizeDictionary, toPseudolocale } from "./fixtures";
import { getEnglishMessages } from "./messages";

describe("pseudolocale fixtures", () => {
	it("wraps, accents, and lengthens copy", () => {
		const pseudo = toPseudolocale("Dashboard");
		expect(pseudo.startsWith("⟦")).toBe(true);
		expect(pseudo.endsWith("⟧")).toBe(true);
		expect(pseudo.length).toBeGreaterThan("Dashboard".length);
		expect(pseudo).not.toContain("Dashboard");
	});

	it("preserves {placeholders} for interpolation", () => {
		const pseudo = toPseudolocale("Showing {filter} items");
		expect(pseudo).toContain("{filter}");
	});

	it("pseudolocalizes the whole catalog shape-preserving", () => {
		const dict = pseudolocalizeDictionary(getEnglishMessages());
		expect(Object.keys(dict)).toEqual(Object.keys(getEnglishMessages()));
		for (const value of Object.values(dict)) {
			expect(value.startsWith("⟦")).toBe(true);
		}
		// Placeholders survive the round trip.
		expect(dict["dashboard.showing"]).toContain("{filter}");
	});

	it("ships long-text fixtures for overflow suites", () => {
		expect(LONG_TEXT_FIXTURES.short.length).toBeGreaterThan(40);
		expect(LONG_TEXT_FIXTURES.medium.length).toBeGreaterThan(LONG_TEXT_FIXTURES.short.length);
		expect(LONG_TEXT_FIXTURES.paragraph.length).toBeGreaterThan(LONG_TEXT_FIXTURES.medium.length);
		expect(LONG_TEXT_FIXTURES.balanceLabel).toContain("balance");
	});
});
