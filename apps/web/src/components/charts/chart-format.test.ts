// SureChartLabels tests: locale formatting + privacy masking.
import { describe, expect, it } from "vitest";
import { SURE_CHART_MASKED_LABEL, defaultChartLabels, withPrivacyMasking } from "./chart-format";

describe("defaultChartLabels", () => {
	it("formats currency/number/percent in the given locale", () => {
		const labels = defaultChartLabels("de-DE", "EUR");
		expect(labels.locale).toBe("de-DE");
		expect(labels.currency).toBe("EUR");
		expect(labels.privacyMasked).toBe(false);
		expect(labels.formatCurrency(12400)).toContain("12");
		expect(labels.formatCurrency(12400)).toContain("€");
		expect(labels.formatNumber(1234567)).toContain("234");
		expect(labels.formatPercent(0.125)).toContain("12,5");
	});

	it("formats en-US currency with the currency symbol", () => {
		const labels = defaultChartLabels("en-US", "USD");
		expect(labels.formatCurrency(12400)).toContain("$");
	});
});

describe("withPrivacyMasking", () => {
	it("masks every value formatter while keeping locale context", () => {
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		expect(masked.privacyMasked).toBe(true);
		expect(masked.locale).toBe("de-DE");
		expect(masked.currency).toBe("EUR");
		expect(masked.formatCurrency(12400)).toBe(SURE_CHART_MASKED_LABEL);
		expect(masked.formatNumber(12400)).toBe(SURE_CHART_MASKED_LABEL);
		expect(masked.formatPercent(0.5)).toBe(SURE_CHART_MASKED_LABEL);
	});
});
