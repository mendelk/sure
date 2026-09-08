// Shared listbox/popover tokens for select, combobox, and menu (apps/web).
//
// One visual language for all overlay lists: same surface, item padding,
// selected/hover/focus treatments, disabled treatment. Feature code must
// not style its own dropdown rows.
import * as stylex from "@stylexjs/stylex";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus } from "./sure-styles";

export const overlayStyles = stylex.create({
	popover: {
		minWidth: 200,
		maxWidth: 360,
		maxHeight: 320,
		overflowY: "auto",
		boxSizing: "border-box",
		backgroundColor: vars.container,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderSecondary,
		borderRadius: vars.radiusMd,
		boxShadow: vars.shadowBorderMd,
		padding: 4,
	},
	listItem: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		paddingBlock: 8,
		paddingInline: 10,
		fontSize: 14,
		color: vars.textPrimary,
		borderRadius: 6,
		cursor: "pointer",
		outlineStyle: "none",
		"[data-focused=true]": {
			backgroundColor: vars.surfaceHover,
		},
		"[data-selected=true]": {
			fontWeight: vars.fontWeightMedium,
		},
		"[data-disabled=true]": {
			color: vars.textSubdued,
			cursor: "not-allowed",
		},
	},
	selectButton: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		width: "100%",
		boxSizing: "border-box",
		paddingBlock: 8,
		paddingInline: 12,
		fontSize: 14,
		color: vars.textPrimary,
		backgroundColor: vars.container,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderPrimary,
		borderRadius: vars.radiusMd,
		cursor: "pointer",
		":disabled": {
			backgroundColor: vars.buttonBgDisabled,
			color: vars.textSubdued,
			cursor: "not-allowed",
		},
		"[data-invalid=true]": {
			borderColor: vars.borderDestructive,
		},
	},
	chevron: {
		width: 14,
		height: 14,
		flexShrink: 0,
		color: vars.textSecondary,
	},
	placeholder: {
		color: vars.textSecondary,
	},
	destructiveItem: {
		color: vars.textDestructiveStrong,
	},
});

export { sureFocus };
