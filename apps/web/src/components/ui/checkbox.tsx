// SureCheckbox + SureSwitch (apps/web).
//
// React Aria toggle behavior (click, Space, indeterminate, form value)
// with Sure tokens. Feature code must use these — never hand-roll a
// checkbox, switch, or toggle div.
import { Checkbox as AriaCheckbox, Switch as AriaSwitch } from "react-aria-components";
import type {
	CheckboxProps as AriaCheckboxProps,
	SwitchProps as AriaSwitchProps,
} from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont } from "./sure-styles";

const boxStyles = stylex.create({
	root: {
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		fontSize: 14,
		color: vars.textPrimary,
		cursor: "pointer",
		":disabled": {
			cursor: "not-allowed",
			color: vars.textSubdued,
		},
	},
	box: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 18,
		height: 18,
		flexShrink: 0,
		backgroundColor: vars.container,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderPrimary,
		borderRadius: 4,
		color: vars.textInverse,
		transitionProperty: "background-color, border-color",
		transitionDuration: "120ms",
		"[data-selected=true]": {
			backgroundColor: vars.bgInverse,
			borderColor: vars.borderSolid,
		},
		"[data-disabled=true]": {
			backgroundColor: vars.buttonBgDisabled,
			borderColor: vars.borderSecondary,
			color: vars.textSubdued,
		},
	},
	check: {
		width: 12,
		height: 12,
	},
	track: {
		display: "inline-flex",
		alignItems: "center",
		width: 40,
		height: 22,
		flexShrink: 0,
		padding: 2,
		boxSizing: "border-box",
		backgroundColor: vars.toggleTrack,
		borderRadius: 999,
		transitionProperty: "background-color",
		transitionDuration: "150ms",
		"[data-selected=true]": {
			backgroundColor: vars.bgInverse,
		},
		"[data-disabled=true]": {
			backgroundColor: vars.buttonBgDisabled,
		},
	},
	thumb: {
		width: 18,
		height: 18,
		borderRadius: "50%",
		backgroundColor: vars.textInverse,
		boxShadow: vars.shadowXs,
		transform: "translateX(0)",
		transitionProperty: "transform",
		transitionDuration: "150ms",
		"[data-selected=true]": {
			transform: "translateX(18px)",
		},
	},
});

function CheckGlyph({ indeterminate = false }: { indeterminate?: boolean }): React.ReactElement {
	if (indeterminate) {
		return (
			<svg aria-hidden="true" viewBox="0 0 12 12" fill="none" {...stylex.props(boxStyles.check)}>
				<path d="M2 6h8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
			</svg>
		);
	}
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" fill="none" {...stylex.props(boxStyles.check)}>
			<path
				d="M2.5 6.2 4.8 8.5 9.5 3.5"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export interface SureCheckboxProps extends Omit<
	AriaCheckboxProps,
	"className" | "style" | "children"
> {
	children: React.ReactNode;
}

export function SureCheckbox({ children, ...rest }: SureCheckboxProps): React.ReactElement {
	return (
		<AriaCheckbox
			{...rest}
			className={() => stylex.props(sureFont.base, boxStyles.root, sureFocus.ring).className ?? ""}
		>
			{(state) => (
				<>
					<span aria-hidden="true" {...stylex.props(boxStyles.box)}>
						{state.isSelected || state.isIndeterminate ? (
							<CheckGlyph indeterminate={state.isIndeterminate} />
						) : null}
					</span>
					<span>{children}</span>
				</>
			)}
		</AriaCheckbox>
	);
}

export interface SureSwitchProps extends Omit<AriaSwitchProps, "className" | "style" | "children"> {
	children: React.ReactNode;
}

export function SureSwitch({ children, ...rest }: SureSwitchProps): React.ReactElement {
	return (
		<AriaSwitch
			{...rest}
			className={() => stylex.props(sureFont.base, boxStyles.root, sureFocus.ring).className ?? ""}
		>
			<span aria-hidden="true" {...stylex.props(boxStyles.track)}>
				<span aria-hidden="true" {...stylex.props(boxStyles.thumb)} />
			</span>
			<span>{children}</span>
		</AriaSwitch>
	);
}
