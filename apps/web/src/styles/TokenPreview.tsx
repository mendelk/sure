// Representative token preview (apps/web).
//
// Renders semantic token values for one theme so tests — and later Storybook
// stories (t_alt_fnd_009) — can prove light/dark outputs without hand-copying
// hex values. Colors come from the generated plain-data twin
// (sure-token-values.ts), never from literals, per styles/README.md.
import { darkValues, lightValues } from "./sure-token-values";
import type { SureTokenName } from "./sure-tokens.stylex";
import type { SureThemeName } from "./theme";

export interface TokenPreviewSwatch {
	readonly name: SureTokenName;
	readonly label: string;
}

export const TOKEN_PREVIEW_SWATCHES: readonly TokenPreviewSwatch[] = [
	{ name: "surface", label: "Surface" },
	{ name: "container", label: "Container" },
	{ name: "textPrimary", label: "Text primary" },
	{ name: "textSecondary", label: "Text secondary" },
	{ name: "success", label: "Success" },
	{ name: "warning", label: "Warning" },
	{ name: "destructive", label: "Destructive" },
	{ name: "info", label: "Info" },
	{ name: "borderPrimary", label: "Border primary" },
	{ name: "buttonBgPrimary", label: "Button primary" },
	{ name: "chartUnusedFill", label: "Chart unused fill" },
	{ name: "chartUnallocatedFill", label: "Chart unallocated fill" },
];

export interface TokenPreviewProps {
	readonly theme: SureThemeName;
}

export function valuesForTheme(theme: SureThemeName): Record<SureTokenName, string> {
	return theme === "dark" ? darkValues : lightValues;
}

/**
 * Static preview of representative semantic tokens for `theme`. Uses inline
 * styles from generated values (not the StyleX compiler) so vitest can assert
 * on the exact rendered output for light and dark.
 */
export function TokenPreview({ theme }: TokenPreviewProps) {
	const values = valuesForTheme(theme);
	return (
		<section data-testid={`token-preview-${theme}`} data-theme={theme}>
			<ul>
				{TOKEN_PREVIEW_SWATCHES.map((swatch) => (
					<li
						key={swatch.name}
						data-testid={`swatch-${swatch.name}-${theme}`}
						data-token={swatch.name}
						data-value={values[swatch.name]}
						title={`${swatch.name}: ${values[swatch.name]}`}
						style={{
							backgroundColor: values.container,
							borderColor: values.borderPrimary,
							borderStyle: "solid",
							borderWidth: 1,
							borderRadius: values.radiusMd,
							boxShadow: values.shadowXs,
							color: values.textPrimary,
							fontFamily: values.fontSans,
						}}
					>
						<span
							data-testid={`swatch-chip-${swatch.name}-${theme}`}
							data-value={values[swatch.name]}
							style={{ backgroundColor: values[swatch.name] }}
						/>
						{swatch.label}
					</li>
				))}
			</ul>
			<p
				data-testid={`type-sample-${theme}`}
				style={{ fontFamily: values.fontSans, color: values.textPrimary }}
			>
				Primary text sample
			</p>
			<p
				data-testid={`motion-sample-${theme}`}
				data-motion={values.motionStrokeFill}
				style={{ fontFamily: values.fontMono, color: values.textSecondary }}
			>
				Motion token: {values.motionStrokeFill}
			</p>
		</section>
	);
}
