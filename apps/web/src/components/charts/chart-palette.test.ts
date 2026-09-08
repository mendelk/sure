// Semantic chart palette tests: token-only mapping, both themes.
import { describe, expect, it } from "vitest";
import { darkValues, lightValues } from "~/styles/sure-token-values";
import { sureChartPalette, sureChartTheme } from "./chart-palette";

describe("sureChartTheme", () => {
	it("maps light theme chrome from semantic tokens", () => {
		const mapping = sureChartTheme("light");
		expect(mapping.foreground).toBe(lightValues.textPrimary);
		expect(mapping.muted).toBe(lightValues.textSecondary);
		expect(mapping.grid).toBe(lightValues.borderSubdued);
		expect(mapping.background).toBe(lightValues.container);
	});

	it("resolves a different dark palette", () => {
		const light = sureChartTheme("light");
		const dark = sureChartTheme("dark");
		expect(dark.foreground).toBe(darkValues.textPrimary);
		expect(dark.foreground).not.toBe(light.foreground);
		expect(dark.palette.primary).toBe(darkValues.info);
	});

	it("fixes series meaning across themes", () => {
		for (const theme of ["light", "dark"] as const) {
			const palette = sureChartPalette(theme);
			const values = theme === "light" ? lightValues : darkValues;
			expect(palette.positive).toBe(values.success);
			expect(palette.negative).toBe(values.destructive);
			expect(palette.primary).toBe(values.info);
			expect(palette.unallocated).toBe(values.chartUnallocatedFill);
			expect(palette.allocation).toHaveLength(6);
		}
	});
});
