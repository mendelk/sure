// SureTextField (apps/web).
//
// Labeled text input / textarea with description + error wiring. React Aria
// owns labeling, aria-invalid, and aria-describedby; this file only adds
// Sure tokens. Always pass `label`; pass `errorMessage` (with `isInvalid`
// or automatic invalid) for failures — never render errors as plain text.
import {
	FieldError,
	Input,
	Label,
	Text,
	TextArea,
	TextField as AriaTextField,
} from "react-aria-components";
import type { TextFieldProps as AriaTextFieldProps } from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont } from "./sure-styles";

export interface SureTextFieldProps extends Omit<
	AriaTextFieldProps,
	"className" | "style" | "children"
> {
	label: string;
	description?: string;
	/**
	 * Failure text, rendered as a `FieldError` child (React Aria has no
	 * `errorMessage` field prop — errors must be FieldError children).
	 * Announced assertively via `role="alert"`.
	 */
	errorMessage?: React.ReactNode;
	/** Placeholder hint for the input/textarea (React Aria has no field-level
	 * placeholder prop — it lives on the input element). */
	placeholder?: string;
	/** Render a textarea instead of an input. */
	multiline?: boolean;
	children?: React.ReactNode;
}

const fieldStyles = stylex.create({
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
	input: {
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
	textarea: {
		minHeight: 88,
		resize: "vertical",
	},
	description: {
		fontSize: 12,
		color: vars.textSecondary,
	},
	error: {
		fontSize: 12,
		color: vars.textDestructiveStrong,
	},
});

export function SureTextField({
	label,
	description,
	errorMessage,
	placeholder,
	multiline = false,
	isRequired,
	children,
	...rest
}: SureTextFieldProps): React.ReactElement {
	return (
		<AriaTextField
			{...rest}
			{...(isRequired === true ? { isRequired: true } : null)}
			{...stylex.props(fieldStyles.root)}
		>
			<Label {...stylex.props(sureFont.base, fieldStyles.label)}>
				{label}
				{isRequired === true ? (
					<span aria-hidden="true" {...stylex.props(fieldStyles.requiredMark)}>
						*
					</span>
				) : null}
			</Label>
			{multiline ? (
				<TextArea
					{...(placeholder != null ? { placeholder } : null)}
					{...stylex.props(sureFont.base, fieldStyles.input, fieldStyles.textarea, sureFocus.ring)}
				/>
			) : (
				<Input
					{...(placeholder != null ? { placeholder } : null)}
					{...stylex.props(sureFont.base, fieldStyles.input, sureFocus.ring)}
				/>
			)}
			{description != null && description !== "" ? (
				<Text slot="description" {...stylex.props(sureFont.base, fieldStyles.description)}>
					{description}
				</Text>
			) : null}
			{/* React Aria wires the error via aria-describedby but renders no
				live region of its own (and drops an explicit role), so wrap
				the FieldError in role="alert" for assertive announcement. */}
			<span role="alert">
				<FieldError {...stylex.props(sureFont.base, fieldStyles.error)}>{errorMessage}</FieldError>
			</span>
			{children}
		</AriaTextField>
	);
}
