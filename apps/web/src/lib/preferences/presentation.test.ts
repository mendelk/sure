// Presentation-preference persistence tests (t_alt_fnd_011).
//
// Only non-sensitive presentation choices persist (theme choice, locale,
// privacy flag); the sync plan pins the future user-settings contract
// (same three fields, last-write-wins, never sensitive data).
//
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_PRESENTATION,
	PRESENTATION_SYNC_PLAN,
	SURE_LOCALE_STORAGE_KEY,
	SURE_PRIVACY_MASKED_VALUE,
	SURE_PRIVACY_STORAGE_KEY,
	SURE_THEME_STORAGE_KEY,
	clearPresentationPreferences,
	loadPresentationPreferences,
	savePresentationPreferences,
} from "./presentation";

beforeEach(() => {
	localStorage.clear();
});

describe("presentation preferences", () => {
	it("defaults to system theme, English, unmasked (SSR-safe)", () => {
		expect(loadPresentationPreferences()).toEqual(DEFAULT_PRESENTATION);
		expect(DEFAULT_PRESENTATION).toEqual({
			themeChoice: "system",
			locale: "en",
			privacyMasked: false,
		});
	});

	it("persists theme choices; system clears the override", () => {
		savePresentationPreferences({ themeChoice: "dark" });
		expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBe("dark");
		expect(loadPresentationPreferences().themeChoice).toBe("dark");

		savePresentationPreferences({ themeChoice: "system" });
		expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBeNull();
		expect(loadPresentationPreferences().themeChoice).toBe("system");
	});

	it("persists locale and privacy flag; English unsets the locale key", () => {
		savePresentationPreferences({ locale: "de-DE", privacyMasked: true });
		expect(loadPresentationPreferences().locale).toContain("de");
		expect(localStorage.getItem(SURE_PRIVACY_STORAGE_KEY)).toBe(SURE_PRIVACY_MASKED_VALUE);

		savePresentationPreferences({ locale: "en", privacyMasked: false });
		expect(localStorage.getItem(SURE_LOCALE_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(SURE_PRIVACY_STORAGE_KEY)).toBeNull();
	});

	it("falls back defensively on garbage stored values", () => {
		localStorage.setItem(SURE_THEME_STORAGE_KEY, "amoled");
		localStorage.setItem(SURE_LOCALE_STORAGE_KEY, "!!!");
		expect(loadPresentationPreferences().themeChoice).toBe("system");
		expect(loadPresentationPreferences().locale).toBe("en");
	});

	it("clears every presentation key without touching anything else", () => {
		localStorage.setItem("unrelated", "keep");
		savePresentationPreferences({ themeChoice: "light", privacyMasked: true });
		clearPresentationPreferences();
		expect(loadPresentationPreferences()).toEqual(DEFAULT_PRESENTATION);
		expect(localStorage.getItem("unrelated")).toBe("keep");
	});

	it("pins the future settings-sync contract to non-sensitive fields", () => {
		expect(PRESENTATION_SYNC_PLAN.fields).toEqual(["theme", "locale", "privacyMasked"]);
		expect(PRESENTATION_SYNC_PLAN.conflictPolicy).toContain("last-write-wins");
		for (const forbidden of ["tokens", "balances", "emails", "transactions"]) {
			expect(PRESENTATION_SYNC_PLAN.fields).not.toContain(forbidden);
			expect(PRESENTATION_SYNC_PLAN.neverSynced).toContain(forbidden);
		}
	});
});
