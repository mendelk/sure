// SureButton + SureLink (apps/web).
//
// React Aria Button/Link behavior (press, keyboard, disabled, focus) with
// Sure semantic tokens. Variants map 1:1 to intent — feature code must not
// invent new button shapes; extend `SureButtonVariant` here instead.
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import type {
	ButtonProps as AriaButtonProps,
	LinkProps as AriaLinkProps,
} from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureA11y, sureFocus, sureFont, type SureStyle } from "./sure-styles";

export type SureButtonVariant =
	| "primary"
	| "secondary"
	| "secondary-strong"
	| "destructive"
	| "ghost"
	| "outline";
export type SureButtonSize = "sm" | "md" | "lg";

export interface SureButtonProps extends Omit<AriaButtonProps, "className" | "style" | "children"> {
	variant?: SureButtonVariant;
	size?: SureButtonSize;
	/**
	 * Loading state comes from React Aria (`isPending`, inherited):
	 * disables interaction, sets `aria-disabled` + `data-pending`, and shows
	 * a spinner while keeping the label. The button stays focusable so the
	 * state is perceivable.
	 */
	children: React.ReactNode;
}

const sureSpin = stylex.keyframes({
	to: { transform: "rotate(360deg)" },
});

const buttonStyles = stylex.create({
	base: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: "transparent",
		borderRadius: vars.radiusMd,
		cursor: "pointer",
		fontWeight: vars.fontWeightMedium,
		textDecorationLine: "none",
		transitionProperty: "background-color, border-color, color",
		transitionDuration: "150ms",
		":disabled": {
			cursor: "not-allowed",
		},
	},
	primary: { backgroundColor: vars.buttonBgPrimary, color: vars.textInverse },
	secondary: {
		backgroundColor: vars.buttonBgSecondary,
		color: vars.textPrimary,
		borderColor: vars.borderSecondary,
	},
	"secondary-strong": {
		backgroundColor: vars.buttonBgSecondaryStrong,
		color: vars.textPrimary,
	},
	destructive: {
		backgroundColor: vars.buttonBgDestructive,
		color: vars.textInverse,
	},
	ghost: { backgroundColor: "transparent", color: vars.textPrimary },
	outline: {
		backgroundColor: "transparent",
		color: vars.textPrimary,
		borderColor: vars.borderPrimary,
	},
	hoverPrimary: { ":hover": { backgroundColor: vars.buttonBgPrimaryHover } },
	hoverSecondary: { ":hover": { backgroundColor: vars.buttonBgSecondaryHover } },
	hoverSecondaryStrong: {
		":hover": { backgroundColor: vars.buttonBgSecondaryStrongHover },
	},
	hoverDestructive: {
		":hover": { backgroundColor: vars.buttonBgDestructiveHover },
	},
	hoverGhost: { ":hover": { backgroundColor: vars.buttonBgGhostHover } },
	hoverOutline: { ":hover": { backgroundColor: vars.buttonBgOutlineHover } },
	disabled: {
		backgroundColor: vars.buttonBgDisabled,
		color: vars.textSubdued,
		borderColor: "transparent",
	},
	sm: { paddingBlock: 6, paddingInline: 12, fontSize: 13, minHeight: 32 },
	md: { paddingBlock: 8, paddingInline: 16, fontSize: 14, minHeight: 40 },
	lg: { paddingBlock: 12, paddingInline: 20, fontSize: 16, minHeight: 48 },
	spinner: {
		width: 14,
		height: 14,
		flexShrink: 0,
		borderRadius: "50%",
		borderStyle: "solid",
		borderWidth: 2,
		borderColor: "transparent",
		borderTopColor: "currentColor",
		animationName: sureSpin,
		animationDuration: "700ms",
		animationTimingFunction: "linear",
		animationIterationCount: "infinite",
	},
});

const HOVER: Record<SureButtonVariant, SureStyle> = {
	primary: buttonStyles.hoverPrimary,
	secondary: buttonStyles.hoverSecondary,
	"secondary-strong": buttonStyles.hoverSecondaryStrong,
	destructive: buttonStyles.hoverDestructive,
	ghost: buttonStyles.hoverGhost,
	outline: buttonStyles.hoverOutline,
};

const VARIANT: Record<SureButtonVariant, SureStyle> = {
	primary: buttonStyles.primary,
	secondary: buttonStyles.secondary,
	"secondary-strong": buttonStyles["secondary-strong"],
	destructive: buttonStyles.destructive,
	ghost: buttonStyles.ghost,
	outline: buttonStyles.outline,
};

const SIZE: Record<SureButtonSize, SureStyle> = {
	sm: buttonStyles.sm,
	md: buttonStyles.md,
	lg: buttonStyles.lg,
};

export function SureButton({
	variant = "primary",
	size = "md",
	isPending,
	isDisabled,
	children,
	...rest
}: SureButtonProps): React.ReactElement {
	return (
		<AriaButton
			{...rest}
			{...(isPending === true ? { isPending: true } : null)}
			{...(isDisabled === true ? { isDisabled: true } : null)}
			className={(state) =>
				stylex.props(
					sureFont.base,
					buttonStyles.base,
					VARIANT[variant],
					SIZE[size],
					HOVER[variant],
					(state.isDisabled || state.isPending) && buttonStyles.disabled,
					sureFocus.ring,
				).className ?? ""
			}
		>
			{isPending === true ? (
				<>
					<span aria-hidden="true" {...stylex.props(buttonStyles.spinner)} />
					<span {...stylex.props(sureA11y.visuallyHidden)}>{formatMessage("ui.loading")}</span>
				</>
			) : null}
			{children}
		</AriaButton>
	);
}

export interface SureLinkProps extends Omit<AriaLinkProps, "className" | "style" | "children"> {
	variant?: "default" | "subtle";
	children: React.ReactNode;
}

const linkStyles = stylex.create({
	base: {
		color: vars.link,
		textDecorationLine: "underline",
		textUnderlineOffset: 2,
		textDecorationThickness: 1,
		cursor: "pointer",
		":hover": {
			textDecorationThickness: 2,
		},
	},
	subtle: {
		color: vars.textSecondary,
		":hover": {
			color: vars.textPrimary,
		},
	},
});

export function SureLink({
	variant = "default",
	children,
	...rest
}: SureLinkProps): React.ReactElement {
	return (
		<AriaLink
			{...rest}
			className={() =>
				stylex.props(
					sureFont.base,
					linkStyles.base,
					variant === "subtle" && linkStyles.subtle,
					sureFocus.ring,
				).className ?? ""
			}
		>
			{children}
		</AriaLink>
	);
}
