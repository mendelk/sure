// Theme-choice tests (t_alt_fnd_011).
//
// Light/dark/system selection on top of the unchanged light/dark runtime:
// explicit choices win, "system" follows the OS, persistence normalizes
// "system" to absence (the pre-existing storage contract), and OS changes
// re-resolve through the subscription helper.
//
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	SURE_THEME_CHOICE_SYSTEM_VALUE,
	SURE_THEME_STORAGE_KEY,
	isThemeChoice,
	isThemeName,
	parseStoredTheme,
	parseThemeChoice,
	persistThemeChoiceValue,
	readSystemPrefersDark,
	resolveThemeChoice,
	subscribeToSystemTheme,
} from "./theme";

beforeEach(() => {
	localStorage.clear();
});

describe("theme choice", () => {
	it("parses light/dark/system, defaulting garbage to system", () => {
		expect(parseThemeChoice("light")).toBe("light");
		expect(parseThemeChoice("dark")).toBe("dark");
		expect(parseThemeChoice("system")).toBe("system");
		for (const raw of [null, undefined, "", "LIGHT", "amoled"]) {
			expect(parseThemeChoice(raw)).toBe("system");
		}
		expect(isThemeChoice("system")).toBe(true);
		expect(isThemeChoice("amoled")).toBe(false);
		// The original light/dark contract is unchanged (system → null).
		expect(parseStoredTheme("system")).toBeNull();
		expect(isThemeName("system")).toBe(false);
	});

	it("resolves explicit choices first, system from the OS", () => {
		expect(resolveThemeChoice("dark", false)).toBe("dark");
		expect(resolveThemeChoice("light", true)).toBe("light");
		expect(resolveThemeChoice("system", true)).toBe("dark");
		expect(resolveThemeChoice("system", false)).toBe("light");
	});

	it("persists explicit themes; system clears the override", () => {
		persistThemeChoiceValue("dark");
		expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBe("dark");
		persistThemeChoiceValue("system");
		expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBeNull();
		expect(SURE_THEME_CHOICE_SYSTEM_VALUE).toBe("system");
	});

	it("reads the OS preference defensively", () => {
		expect(readSystemPrefersDark()).toBe(false);
	});

	it("notifies system-theme subscribers and unsubscribes", () => {
		const listeners = new Set<(event: { matches: boolean }) => void>();
		type MediaHandler = (event: { matches: boolean }) => void;
		const query = {
			matches: false,
			addEventListener: vi.fn<(event: string, handler: MediaHandler) => void>((_event, handler) => {
				listeners.add(handler);
			}),
			removeEventListener: vi.fn<(event: string, handler: MediaHandler) => void>(
				(_event, handler) => {
					listeners.delete(handler);
				},
			),
		};
		vi.stubGlobal("window", {
			matchMedia: vi.fn<() => typeof query>(() => query),
		});
		try {
			const seen: boolean[] = [];
			const unsubscribe = subscribeToSystemTheme((prefersDark) => {
				seen.push(prefersDark);
			});
			for (const listener of listeners) {
				listener({ matches: true });
			}
			expect(seen).toEqual([true]);
			unsubscribe();
			expect(query.removeEventListener).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
