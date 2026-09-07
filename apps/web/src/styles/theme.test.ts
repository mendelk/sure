// Unit tests for the handwritten theme runtime: stored preference and OS
// color-scheme default. There is intentionally no inline theme script
// (ADR-0001 REQ-TRAN-02 forbids inline scripts); csp-no-inline-scripts.test
// proves none exists.
import { describe, expect, it } from "vitest";
import {
	SURE_THEME_ATTR,
	SURE_THEME_STORAGE_KEY,
	getInitialTheme,
	isThemeName,
	parseStoredTheme,
	systemThemeName,
} from "./theme";

describe("theme runtime", () => {
	it("validates stored preferences strictly", () => {
		expect(parseStoredTheme("light")).toBe("light");
		expect(parseStoredTheme("dark")).toBe("dark");
		for (const raw of [null, undefined, "", "LIGHT", "dark ", "system"]) {
			expect(parseStoredTheme(raw)).toBeNull();
		}
		expect(isThemeName("light")).toBe(true);
		expect(isThemeName("nope")).toBe(false);
	});

	it("prefers the stored choice, then falls back to the OS default", () => {
		expect(getInitialTheme("dark", false)).toBe("dark");
		expect(getInitialTheme("light", true)).toBe("light");
		expect(getInitialTheme("bogus", true)).toBe("dark");
		expect(getInitialTheme(null, true)).toBe("dark");
		expect(getInitialTheme(null, false)).toBe("light");
		expect(systemThemeName(true)).toBe("dark");
		expect(systemThemeName(false)).toBe("light");
	});

	it("exposes stable storage-key and attribute constants for the root route", () => {
		expect(SURE_THEME_STORAGE_KEY).toBe("sure-theme");
		expect(SURE_THEME_ATTR).toBe("data-theme");
	});
});
