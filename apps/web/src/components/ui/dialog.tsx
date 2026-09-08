// SureDialog + SurePopover (apps/web).
//
// Modal dialogs (focus trap, Escape, overlay dismiss, labelled by heading)
// and non-modal popovers (always labelled via `label`). Never build an
// overlay with raw fixed-position divs.
import {
	Button,
	Dialog as AriaDialog,
	DialogTrigger,
	Heading,
	Modal,
	Popover as AriaPopover,
} from "react-aria-components";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont, type SureStyle } from "./sure-styles";

const dialogStyles = stylex.create({
	overlay: {
		position: "fixed",
		inset: 0,
		zIndex: 50,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: 16,
		boxSizing: "border-box",
		backgroundColor: vars.bgOverlay,
	},
	dialog: {
		position: "relative",
		width: "100%",
		maxHeight: "calc(100vh - 64px)",
		overflowY: "auto",
		boxSizing: "border-box",
		backgroundColor: vars.container,
		color: vars.textPrimary,
		borderRadius: vars.radiusLg,
		boxShadow: vars.shadowBorderLg,
		padding: 20,
		outlineStyle: "none",
	},
	sm: { maxWidth: 400 },
	md: { maxWidth: 560 },
	lg: { maxWidth: 800 },
	title: {
		marginTop: 0,
		marginBottom: 8,
		paddingRight: 32,
		fontSize: 18,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
	},
	body: {
		fontSize: 14,
		color: vars.textSecondary,
	},
	footer: {
		display: "flex",
		justifyContent: "flex-end",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 20,
	},
	close: {
		position: "absolute",
		top: 12,
		right: 12,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 32,
		height: 32,
		padding: 0,
		backgroundColor: "transparent",
		color: vars.textSecondary,
		borderStyle: "none",
		borderWidth: 0,
		borderRadius: vars.radiusMd,
		cursor: "pointer",
		":hover": {
			backgroundColor: vars.surfaceHover,
			color: vars.textPrimary,
		},
	},
	closeIcon: {
		width: 16,
		height: 16,
	},
	popover: {
		maxWidth: 360,
		boxSizing: "border-box",
		backgroundColor: vars.container,
		color: vars.textPrimary,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderSecondary,
		borderRadius: vars.radiusMd,
		boxShadow: vars.shadowBorderMd,
		padding: 12,
		outlineStyle: "none",
	},
});

function CloseIcon(): React.ReactElement {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			{...stylex.props(dialogStyles.closeIcon)}
		>
			<path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
		</svg>
	);
}

export type SureDialogSize = "sm" | "md" | "lg";

export interface SureDialogProps {
	/** Accessible title (rendered as the dialog heading). */
	title: string;
	/** Element that opens the dialog (button, link, …). */
	trigger: React.ReactNode;
	children: React.ReactNode;
	/** Footer actions (e.g. Cancel/Confirm buttons). */
	footer?: React.ReactNode;
	size?: SureDialogSize;
	/** Clicking the overlay dismisses. Defaults to true. */
	isDismissable?: boolean;
	defaultOpen?: boolean;
}

const DIALOG_SIZE: Record<SureDialogSize, SureStyle> = {
	sm: dialogStyles.sm,
	md: dialogStyles.md,
	lg: dialogStyles.lg,
};

export function SureDialog({
	title,
	trigger,
	children,
	footer,
	size = "md",
	isDismissable = true,
	defaultOpen,
}: SureDialogProps): React.ReactElement {
	return (
		<DialogTrigger {...(defaultOpen === true ? { defaultOpen: true } : null)}>
			{trigger}
			<Modal isDismissable={isDismissable} {...stylex.props(dialogStyles.overlay)}>
				<AriaDialog {...stylex.props(sureFont.base, dialogStyles.dialog, DIALOG_SIZE[size])}>
					{({ close }) => (
						<>
							<Heading slot="title" {...stylex.props(dialogStyles.title)}>
								{title}
							</Heading>
							<div {...stylex.props(dialogStyles.body)}>{children}</div>
							{footer != null ? <div {...stylex.props(dialogStyles.footer)}>{footer}</div> : null}
							<Button
								aria-label={formatMessage("ui.closeDialog")}
								onPress={() => {
									close();
								}}
								{...stylex.props(dialogStyles.close, sureFocus.ring)}
							>
								<CloseIcon />
							</Button>
						</>
					)}
				</AriaDialog>
			</Modal>
		</DialogTrigger>
	);
}

export interface SurePopoverProps extends Omit<
	AriaPopoverProps,
	"children" | "className" | "style"
> {
	/** Accessible label for the popover region (rendered as a Dialog). */
	label: string;
	children: React.ReactNode;
}

export function SurePopover({ label, children, ...rest }: SurePopoverProps): React.ReactElement {
	return (
		<AriaPopover {...rest} {...stylex.props(dialogStyles.popover)}>
			<AriaDialog aria-label={label} {...stylex.props(sureFont.base)}>
				{children}
			</AriaDialog>
		</AriaPopover>
	);
}
