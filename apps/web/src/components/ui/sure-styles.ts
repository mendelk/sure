// Shared Sure UI primitive styles (apps/web).
//
// Small building blocks every primitive composes through `stylex.props`:
// a visible focus indicator, the base font stack, and shared motion
// guards. Values come only from the generated semantic theme
// (`~/styles/sure-tokens.stylex`); raw palette literals are forbidden by
// the `no-raw-palette` drift test.
import * as stylex from "@stylexjs/stylex";
import type { CompiledStyles } from "@stylexjs/stylex";
import { vars } from "~/styles/sure-tokens.stylex";

/** A compiled `stylex.create()` entry — the unit `stylex.props` accepts. */
export type SureStyle = CompiledStyles;

export const sureFont = stylex.create({
	base: {
		fontFamily: vars.fontSans,
	},
	mono: {
		fontFamily: vars.fontMono,
	},
});

/** Visible keyboard focus indicator. Pass into `stylex.props` last. */
export const sureFocus = stylex.create({
	ring: {
		outlineStyle: "none",
		outlineWidth: 0,
		":focus-visible": {
			outlineStyle: "solid",
			outlineWidth: 2,
			outlineColor: vars.focusRing,
			outlineOffset: 2,
		},
	},
});

/** Screen-reader-only text (loading labels, icon-button names). */
export const sureA11y = stylex.create({
	visuallyHidden: {
		position: "absolute",
		width: 1,
		height: 1,
		padding: 0,
		margin: -1,
		overflow: "hidden",
		clipPath: "inset(50%)",
		whiteSpace: "nowrap",
		borderStyle: "none",
		borderWidth: 0,
	},
});

/**
 * Motion that collapses under `prefers-reduced-motion`. The global guard in
 * `sure-theme.css` already zeroes transitions/animations; use this only for
 * keyframe-driven decoration (skeleton shimmer, toast entrance) so the
 * animation runs exclusively when motion is allowed.
 */
export const sureMotion = stylex.create({
	allowOnly: {
		"@media (prefers-reduced-motion: reduce)": {
			animationName: "none",
		},
	},
});
