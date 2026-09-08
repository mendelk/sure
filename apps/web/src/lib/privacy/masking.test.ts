// Privacy masking tests (t_alt_fnd_011).
//
// The global control masks every leak channel — visible text, accessible
// names, tooltips, copied text, previews, chart values — without mutating
// source data. Unmasked values pass through byte-identical.
import { describe, expect, it } from "vitest";
import {
	PRIVACY_MASK,
	maskChartPoint,
	maskChartSeries,
	maskCopiedText,
	maskDisplayValue,
	maskTooltipText,
	privacyAccessibleName,
} from "./masking";

describe("privacy masking", () => {
	it("masks display values with a fixed glyph, passing through when off", () => {
		expect(maskDisplayValue(true, "$1,234.50")).toBe(PRIVACY_MASK);
		expect(maskDisplayValue(false, "$1,234.50")).toBe("$1,234.50");
	});

	it("never exposes real amounts in accessible names when masked", () => {
		expect(privacyAccessibleName(true, "$1,234.50")).toBe("Hidden value");
		expect(privacyAccessibleName(true, "$1,234.50")).not.toContain("1,234");
		expect(privacyAccessibleName(false, "$1,234.50")).toBe("$1,234.50");
	});

	it("uses a fixed copy/preview mask for every numeral script", () => {
		const source = "Balance $1,234.50 as of Mar 15, 2026 (account ••4821)";
		expect(maskCopiedText(true, source)).toBe(PRIVACY_MASK);
		expect(maskCopiedText(false, source)).toBe(source);
		expect(maskTooltipText(true, "Total: €2.500,00")).toBe(PRIVACY_MASK);
		// Arabic-Indic digits, Arabic separators, directional mark, and a
		// localized currency label must never survive masked copy output.
		const arabic = "\u200f١٬٢٣٤٫٥٠ US$";
		expect(maskCopiedText(true, arabic)).toBe(PRIVACY_MASK);
		expect(maskCopiedText(true, arabic)).not.toContain("١");
	});

	it("masks chart points without mutating the source", () => {
		const point = { label: "March", value: 1234.5 } as const;
		const frozen = Object.freeze({ ...point });
		const masked = maskChartPoint(true, frozen);
		expect(masked).toEqual({ label: PRIVACY_MASK, value: 0 });
		expect(frozen).toEqual({ label: "March", value: 1234.5 });

		const series = maskChartSeries(true, [frozen, { label: "April", value: 999 }]);
		expect(series).toHaveLength(2);
		expect(series[0]).toEqual({ label: PRIVACY_MASK, value: 0 });
		expect(series[1]?.value).toBe(0);

		const passthrough = maskChartPoint(false, frozen);
		expect(passthrough).toEqual({ label: "March", value: 1234.5 });
	});
});
