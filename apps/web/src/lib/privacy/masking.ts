// Privacy masking primitives (t_alt_fnd_011).
//
// A global privacy control masks sensitive values (balances, chart
// values, tooltips, accessible names, copied text, previews) WITHOUT
// mutating source data: every helper here is pure — it derives a display
// string (or a shallow-copied point object) and never writes back to the
// input. When masking is off, values pass through byte-identical.
//
// Masking must cover every channel a value can leak through:
// visible text, `aria-label`/`title`/tooltips, clipboard text, link
// previews, AND the accessibility tree (masked nodes expose only the
// generic "Hidden value" message key — never the real amount).

import { formatMessage } from "~/lib/i18n/messages";

/** Display glyph for masked values (fixed width, no length oracle). */
export const PRIVACY_MASK = "•••" as const;

/**
 * Mask a display value. Returns the fixed mask when enabled, otherwise
 * the original string untouched.
 */
export function maskDisplayValue(masked: boolean, value: string): string {
	return masked ? PRIVACY_MASK : value;
}

/**
 * Accessible name for a masked value: the generic message — never the
 * real amount. Unmasked values keep their own name.
 */
export function privacyAccessibleName(masked: boolean, exposedName: string): string {
	if (!masked) {
		return exposedName;
	}
	return formatMessage("privacy.maskedValue");
}

/**
 * Mask copied or previewed sensitive text with one fixed token. This is
 * intentionally not digit-pattern based: Intl can emit Arabic-Indic and
 * other non-ASCII numerals, directional marks, localized separators, and
 * currency names. Returning a fixed token avoids locale-specific leaks and
 * length or punctuation oracles. Unmasked input passes through untouched.
 */
export function maskCopiedText(masked: boolean, text: string): string {
	return masked ? PRIVACY_MASK : text;
}

/** Alias for tooltip/preview channels (same guarantee as clipboard). */
export function maskTooltipText(masked: boolean, text: string): string {
	return maskCopiedText(masked, text);
}

export interface ChartPoint {
	readonly label: string;
	readonly value: number;
}

/**
 * Mask a chart point without mutating it: the returned point carries a
 * zeroed value and a masked label, while the input object is untouched
 * (verified by tests via Object.freeze). Unmasked input returns an
 * equal-valued copy.
 */
export function maskChartPoint(masked: boolean, point: ChartPoint): ChartPoint {
	if (!masked) {
		return { label: point.label, value: point.value };
	}
	return { label: PRIVACY_MASK, value: 0 };
}

/** Mask a whole series (e.g. chart data arrays) without mutation. */
export function maskChartSeries(masked: boolean, series: readonly ChartPoint[]): ChartPoint[] {
	return series.map((point) => maskChartPoint(masked, point));
}
