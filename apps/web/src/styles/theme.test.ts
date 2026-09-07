// Unit tests for the handwritten theme runtime: stored preference,
// OS color-scheme default, and the pre-paint inline script contract.
import { describe, expect, it } from "vitest";
import {
	SURE_THEME_ATTR,
	SURE_THEME_STORAGE_KEY,
	getInitialTheme,
	isThemeName,
	parseStoredTheme,
	sureThemeInlineScript,
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

	it("keeps the inline pre-paint script in sync with the runtime contract", () => {
		expect(sureThemeInlineScript).toContain(`"${SURE_THEME_STORAGE_KEY}"`);
		expect(sureThemeInlineScript).toContain(SURE_THEME_ATTR);
		expect(sureThemeInlineScript).toContain("(prefers-color-scheme: dark)");
		expect(sureThemeInlineScript).not.toContain("import");
	});
});
