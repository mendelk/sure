// Locale-aware formatting tests (t_alt_fnd_011).
//
// Currency, number, date, and timezone formatting across locales. The
// timezone is always explicit (UTC default), so SSR and the first client
// render agree regardless of host zone (vitest pins TZ=UTC; suites pass
// explicit zones to prove it).
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TIME_ZONE,
	defaultTimeZone,
	formatCurrency,
	formatDate,
	formatDateTime,
	formatNumber,
	resolveLocale,
} from "./format";

const EARLY_UTC = new Date("2026-03-15T02:00:00.000Z");

describe("locale-aware formatting", () => {
	it("formats currency per locale", () => {
		expect(formatCurrency({ amount: 1234.5, currency: "USD", locale: "en-US" })).toBe("$1,234.50");
		const german = formatCurrency({ amount: 1234.5, currency: "EUR", locale: "de-DE" });
		expect(german).toContain("1.234,50");
		expect(german).toContain("€");
	});

	it("formats numbers per locale", () => {
		expect(formatNumber({ value: 1234567.89, locale: "en-US" })).toBe("1,234,567.89");
		expect(formatNumber({ value: 1234567.89, locale: "de-DE" })).toBe("1.234.567,89");
	});

	it("formats dates with a pinned timezone (UTC default)", () => {
		expect(defaultTimeZone()).toBe("UTC");
		expect(DEFAULT_TIME_ZONE).toBe("UTC");
		const utc = formatDate({ date: EARLY_UTC, locale: "en-US" });
		expect(utc).toContain("2026");
		expect(utc).toContain("Mar");
		// Same instant renders as the previous calendar day in Los Angeles.
		const la = formatDate({ date: EARLY_UTC, locale: "en-US", timeZone: "America/Los_Angeles" });
		expect(la).not.toBe(utc);
	});

	it("formats date-times with explicit zones", () => {
		const utc = formatDateTime({ date: EARLY_UTC, locale: "en-US", timeZone: "UTC" });
		const tokyo = formatDateTime({
			date: EARLY_UTC,
			locale: "en-US",
			timeZone: "Asia/Tokyo",
		});
		expect(utc).not.toBe(tokyo);
		expect(tokyo).toContain("2026");
	});

	it("resolves locales defensively, defaulting to English", () => {
		expect(resolveLocale("en-US")).toContain("en");
		expect(resolveLocale(null)).toBe("en");
		expect(resolveLocale("")).toBe("en");
		expect(resolveLocale("not-a-!!!-locale")).toBe("en");
	});
});
