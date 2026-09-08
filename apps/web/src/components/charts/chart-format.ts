// App-owned chart label formatting (t_alt_fnd_016).
//
// The localization/theme/privacy foundation (t_alt_fnd_011) is being built
// concurrently, so charts MUST NOT read a global locale/privacy context,
// persistence layer, or Alpha chart internals for text. Every chart takes a
// `SureChartLabels` value prop instead: callers format numbers/dates in the
// active locale and pre-mask values when privacy mode is on.
//
// INTEGRATION POINT (t_alt_fnd_011): when the foundation lands, its provider
// resolves the active locale + privacy-masked state once and passes the
// resulting `SureChartLabels` down to these charts. No chart changes are
// required — only the call sites that currently build
// `defaultChartLabels(...)` switch to the shared context value.
export interface SureChartLabels {
	/** BCP 47 locale used for every formatted value (e.g. "de-DE"). */
	readonly locale: string;
	/** ISO 4217 currency used by formatCurrency (e.g. "EUR"). */
	readonly currency: string;
	/** True when values must be hidden (privacy mode): formatters mask. */
	readonly privacyMasked: boolean;
	formatCurrency(value: number): string;
	formatNumber(value: number): string;
	formatPercent(fraction: number): string;
}

/** Placeholder rendered wherever a value is masked (privacy mode). */
export const SURE_CHART_MASKED_LABEL = "•••";

export function defaultChartLabels(locale: string, currency: string): SureChartLabels {
	return {
		locale,
		currency,
		privacyMasked: false,
		formatCurrency(value: number): string {
			return new Intl.NumberFormat(locale, {
				style: "currency",
				currency,
				maximumFractionDigits: 0,
			}).format(value);
		},
		formatNumber(value: number): string {
			return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
		},
		formatPercent(fraction: number): string {
			return new Intl.NumberFormat(locale, {
				style: "percent",
				maximumFractionDigits: 1,
			}).format(fraction);
		},
	};
}

/**
 * Wrap base labels so every value formatter returns the masked placeholder.
 * Privacy masking stays a presentation concern of the injected labels — the
 * charts never branch on privacy state themselves.
 */
export function withPrivacyMasking(base: SureChartLabels): SureChartLabels {
	return {
		locale: base.locale,
		currency: base.currency,
		privacyMasked: true,
		formatCurrency(_value: number): string {
			return SURE_CHART_MASKED_LABEL;
		},
		formatNumber(_value: number): string {
			return SURE_CHART_MASKED_LABEL;
		},
		formatPercent(_fraction: number): string {
			return SURE_CHART_MASKED_LABEL;
		},
	};
}
