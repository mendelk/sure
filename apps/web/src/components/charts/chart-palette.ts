// Semantic chart palette + TanStack theme mapping (t_alt_fnd_016).
//
// Colors resolve ONLY from the generated semantic tokens
// (`~/styles/sure-token-values`, the plain-data twin whose documented
// purpose includes canvas/SVG charts). Raw palette literals are forbidden
// by the `no-raw-palette` drift test — this module contains none.
//
// Series meaning is fixed so every Sure chart reads the same:
// positive/income -> success, negative/expenses -> destructive,
// primary trend -> info, warning states -> warning. Allocation slices cycle
// `allocation` in order; the unallocated remainder uses chartUnallocatedFill.
import { darkValues, lightValues } from "~/styles/sure-token-values";
import type { SureThemeName } from "~/styles/theme";

export interface SureChartPalette {
	readonly primary: string;
	readonly positive: string;
	readonly negative: string;
	readonly warning: string;
	readonly muted: string;
	readonly allocation: readonly string[];
	readonly unallocated: string;
}

function paletteFor(theme: SureThemeName): SureChartPalette {
	const values = theme === "dark" ? darkValues : lightValues;
	return {
		primary: values.info,
		positive: values.success,
		negative: values.destructive,
		warning: values.warning,
		muted: values.textSubdued,
		allocation: [
			values.info,
			values.success,
			values.warning,
			values.destructive,
			values.textInfoStrong,
			values.textSuccessStrong,
		],
		unallocated: values.chartUnallocatedFill,
	};
}

export interface SureChartThemeMapping {
	/** Axis/legend text. */
	readonly foreground: string;
	/** Secondary axis text. */
	readonly muted: string;
	/** Grid lines. */
	readonly grid: string;
	/** Chart background (matches the surrounding card). */
	readonly background: string;
	readonly palette: SureChartPalette;
}

/** Full TanStack `defaultTheme` override from semantic tokens. */
export function sureChartTheme(theme: SureThemeName): SureChartThemeMapping {
	const values = theme === "dark" ? darkValues : lightValues;
	const palette = paletteFor(theme);
	return {
		foreground: values.textPrimary,
		muted: values.textSecondary,
		grid: values.borderSubdued,
		background: values.container,
		palette,
	};
}

export { paletteFor as sureChartPalette };
