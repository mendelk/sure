// SureSelect + SureCombobox (apps/web).
//
// Keyboard-navigable single choice (arrows, type-ahead, Enter/Escape come
// from React Aria). Select for short fixed lists; combobox for long or
// filterable lists. Both require `label`; failures surface through
// `errorMessage`, never plain text.
import {
	Button,
	ComboBox as AriaComboBox,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select as AriaSelect,
	SelectValue,
} from "react-aria-components";
import type {
	ComboBoxProps as AriaComboBoxProps,
	SelectProps as AriaSelectProps,
} from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import { useId, useState } from "react";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { overlayStyles } from "./overlay-list";
import { sureFocus, sureFont } from "./sure-styles";
import { fieldInlineStyles } from "./field-inline";

export interface SureOption {
	id: string;
	label: string;
	isDisabled?: boolean;
}

function ChevronDown(): React.ReactElement {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			{...stylex.props(overlayStyles.chevron)}
		>
			<path
				d="m4 6 4 4 4-4"
				stroke="currentColor"
				strokeWidth={1.6}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function OptionRow({ option }: { option: SureOption }): React.ReactElement {
	return (
		<ListBoxItem
			id={option.id}
			textValue={option.label}
			{...(option.isDisabled === true ? { isDisabled: true } : null)}
			{...stylex.props(sureFont.base, overlayStyles.listItem)}
		>
			{option.label}
		</ListBoxItem>
	);
}

export interface SureSelectProps extends Omit<
	AriaSelectProps<SureOption>,
	"children" | "className" | "style"
> {
	label: string;
	items: readonly SureOption[];
	placeholder?: string;
	description?: string;
	errorMessage?: string;
}

export function SureSelect({
	label,
	items,
	placeholder = formatMessage("ui.selectPlaceholder"),
	description,
	errorMessage,
	isRequired,
	...rest
}: SureSelectProps): React.ReactElement {
	const errorId = useId();
	const showError = errorMessage != null && errorMessage !== "";
	return (
		<div {...stylex.props(sureFont.base, fieldInlineStyles.root)}>
			<AriaSelect
				{...rest}
				{...(isRequired === true ? { isRequired: true } : null)}
				{...(showError ? { isInvalid: true } : null)}
				{...(showError ? { "aria-describedby": errorId } : null)}
			>
				<Label {...stylex.props(fieldInlineStyles.label)}>
					{label}
					{isRequired === true ? (
						<span aria-hidden="true" {...stylex.props(fieldInlineStyles.requiredMark)}>
							*
						</span>
					) : null}
				</Label>
				<Button {...stylex.props(overlayStyles.selectButton, sureFocus.ring)}>
					<SelectValue>
						{({ defaultChildren, isPlaceholder }) =>
							isPlaceholder ? (
								<span {...stylex.props(overlayStyles.placeholder)}>{placeholder}</span>
							) : (
								defaultChildren
							)
						}
					</SelectValue>
					<ChevronDown />
				</Button>
				<Popover {...stylex.props(overlayStyles.popover)}>
					<ListBox items={[...items]}>
						{(option: SureOption) => <OptionRow option={option} />}
					</ListBox>
				</Popover>
			</AriaSelect>
			{description != null && description !== "" && !showError ? (
				<p {...stylex.props(fieldInlineStyles.description)}>{description}</p>
			) : null}
			{showError ? (
				<p id={errorId} role="alert" {...stylex.props(fieldInlineStyles.error)}>
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}

export interface SureComboboxProps extends Omit<
	AriaComboBoxProps<SureOption>,
	"children" | "className" | "style"
> {
	label: string;
	items: readonly SureOption[];
	placeholder?: string;
	description?: string;
	errorMessage?: string;
}

export function SureCombobox({
	label,
	items,
	placeholder = formatMessage("ui.comboboxPlaceholder"),
	description,
	errorMessage,
	isRequired,
	onInputChange,
	...rest
}: SureComboboxProps): React.ReactElement {
	const errorId = useId();
	const [filter, setFilter] = useState("");
	const showError = errorMessage != null && errorMessage !== "";
	const needle = filter.trim().toLowerCase();
	const visible =
		needle === ""
			? [...items]
			: items.filter((option) => option.label.toLowerCase().includes(needle));
	return (
		<div {...stylex.props(sureFont.base, fieldInlineStyles.root)}>
			<AriaComboBox
				{...rest}
				{...(isRequired === true ? { isRequired: true } : null)}
				{...(showError ? { isInvalid: true } : null)}
				allowsEmptyCollection={true}
				onInputChange={(value) => {
					setFilter(value);
					onInputChange?.(value);
				}}
				{...(showError ? { "aria-describedby": errorId } : null)}
			>
				<Label {...stylex.props(fieldInlineStyles.label)}>
					{label}
					{isRequired === true ? (
						<span aria-hidden="true" {...stylex.props(fieldInlineStyles.requiredMark)}>
							*
						</span>
					) : null}
				</Label>
				<div {...stylex.props(fieldInlineStyles.comboWrap)}>
					<Input
						placeholder={placeholder}
						{...stylex.props(sureFont.base, fieldInlineStyles.comboInput, sureFocus.ring)}
					/>
					<Button
						aria-label={formatMessage("ui.showOptions")}
						{...stylex.props(fieldInlineStyles.comboButton)}
					>
						<ChevronDown />
					</Button>
				</div>
				<Popover {...stylex.props(overlayStyles.popover)}>
					<ListBox items={visible} aria-label={formatMessage("ui.options", { label })}>
						{(option: SureOption) => <OptionRow option={option} />}
					</ListBox>
				</Popover>
			</AriaComboBox>
			{description != null && description !== "" && !showError ? (
				<p {...stylex.props(fieldInlineStyles.description)}>{description}</p>
			) : null}
			{showError ? (
				<p id={errorId} role="alert" {...stylex.props(fieldInlineStyles.error)}>
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
