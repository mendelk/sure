// Message catalog tests (t_alt_fnd_011).
//
// The catalog is the single source of user-facing copy: keys stay stable,
// English values stay non-empty and interpolation placeholders survive.
import { describe, expect, it } from "vitest";
import {
	DEFAULT_LOCALE,
	SUPPORTED_LOCALES,
	formatMessage,
	getEnglishMessages,
	messagePlaceholders,
} from "./messages";

describe("message catalog", () => {
	it("ships English first with a non-empty dictionary", () => {
		expect(DEFAULT_LOCALE).toBe("en");
		expect(SUPPORTED_LOCALES).toContain("en");
		const dict = getEnglishMessages();
		expect(Object.keys(dict).length).toBeGreaterThan(40);
		for (const value of Object.values(dict)) {
			expect(value.trim().length).toBeGreaterThan(0);
		}
	});

	it("resolves every namespaced area used by the shell and pages", () => {
		const keys = Object.keys(getEnglishMessages());
		for (const prefix of [
			"shell.",
			"public.",
			"routes.",
			"auth.",
			"prefs.",
			"privacy.",
			"home.",
			"dashboard.",
			"settings.",
			"admin.",
			"unauthorized.",
			"ui.",
			"app.",
			"compat.",
		]) {
			expect(keys.some((key) => key.startsWith(prefix))).toBe(true);
		}
	});

	it("interpolates {vars} and leaves unknown placeholders intact", () => {
		expect(formatMessage("shell.brand")).toBe("Sure Web");
		expect(messagePlaceholders("shell.brand")).toEqual([]);
		expect(formatMessage("dashboard.showing", { filter: "active" })).toBe("Showing active items");
		expect(messagePlaceholders("dashboard.showing")).toEqual(["filter"]);
		expect(formatMessage("ui.options", { label: "Country" })).toBe("Country options");
		expect(formatMessage("ui.dismissNotification", { name: "Saved" })).toBe(
			"Dismiss notification: Saved",
		);
		expect(formatMessage("settings.currentSection", { section: "profile" })).toBe(
			"Current section: profile.",
		);
		// Missing vars leave the placeholder visible (never a crash).
		expect(formatMessage("dashboard.showing")).toBe("Showing {filter} items");
	});
});
