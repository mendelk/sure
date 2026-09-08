// Inline label/description/error rows shared by select + combobox (apps/web).
//
// React Aria's Select/ComboBox have no built-in FieldError slot, so these
// wrappers wire `role="alert"` errors with `aria-describedby` instead.
// Semantic tokens only.
import * as stylex from "@stylexjs/stylex";
import { vars } from "~/styles/sure-tokens.stylex";

export const fieldInlineStyles = stylex.create({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		minWidth: 0,
	},
	label: {
		fontSize: 13,
		fontWeight: vars.fontWeightMedium,
		color: vars.textPrimary,
	},
	requiredMark: {
		color: vars.destructive,
		marginLeft: 2,
	},
	description: {
		fontSize: 12,
		color: vars.textSecondary,
	},
	error: {
		fontSize: 12,
		color: vars.textDestructiveStrong,
	},
	comboWrap: {
		position: "relative",
		display: "flex",
		alignItems: "center",
	},
	comboInput: {
		width: "100%",
		boxSizing: "border-box",
		paddingBlock: 8,
		paddingLeft: 12,
		paddingRight: 36,
		fontSize: 14,
		color: vars.textPrimary,
		backgroundColor: vars.container,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderPrimary,
		borderRadius: vars.radiusMd,
		"::placeholder": {
			color: vars.textSecondary,
		},
		":disabled": {
			backgroundColor: vars.buttonBgDisabled,
			color: vars.textSubdued,
			cursor: "not-allowed",
		},
		"[data-invalid=true]": {
			borderColor: vars.borderDestructive,
		},
	},
	comboButton: {
		position: "absolute",
		right: 4,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 28,
		height: 28,
		padding: 0,
		backgroundColor: "transparent",
		borderStyle: "none",
		borderWidth: 0,
		cursor: "pointer",
		color: vars.textSecondary,
		borderRadius: 6,
	},
});
