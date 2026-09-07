// SureMenu (apps/web).
//
// Action menus: button trigger, arrow-key navigation, disabled and
// destructive items, keyboard dismissal — all from React Aria. Feature
// code must not hand-roll dropdown action lists.
import {
	Menu as AriaMenu,
	MenuItem as AriaMenuItem,
	MenuTrigger,
	Popover,
} from "react-aria-components";
import type { MenuProps as AriaMenuProps, PopoverProps } from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { overlayStyles } from "./overlay-list";
import { sureFocus, sureFont } from "./sure-styles";

export interface SureMenuItem {
	id: string;
	label: string;
	/** Short keyboard hint shown right-aligned (informational only). */
	shortcut?: string;
	isDisabled?: boolean;
	isDestructive?: boolean;
}

export interface SureMenuProps<T extends SureMenuItem> extends Omit<
	AriaMenuProps<T>,
	"children" | "className" | "style" | "items" | "aria-label" | "aria-labelledby"
> {
	/** Element that opens the menu — usually a SureButton. Its accessible
	 * name labels the menu (React Aria wires `aria-labelledby` to the
	 * trigger), so the trigger must always be labelled. */
	trigger: React.ReactNode;
	items: readonly T[];
	popoverProps?: Omit<PopoverProps, "children" | "className" | "style">;
}

const menuStyles = stylex.create({
	triggerWrap: {
		display: "inline-block",
	},
	shortcut: {
		marginLeft: "auto",
		paddingLeft: 16,
		fontSize: 12,
		color: vars.textSubdued,
	},
});

export function SureMenu<T extends SureMenuItem>({
	trigger,
	items,
	popoverProps,
	...rest
}: SureMenuProps<T>): React.ReactElement {
	return (
		<MenuTrigger>
			{trigger}
			<Popover {...popoverProps} {...stylex.props(overlayStyles.popover)}>
				<AriaMenu {...rest} items={[...items]} {...stylex.props(sureFont.base)}>
					{(item: T) => (
						<AriaMenuItem
							id={item.id}
							textValue={item.label}
							{...(item.isDisabled === true ? { isDisabled: true } : null)}
							{...stylex.props(
								overlayStyles.listItem,
								item.isDestructive === true && overlayStyles.destructiveItem,
								sureFocus.ring,
							)}
						>
							{item.label}
							{item.shortcut != null && item.shortcut !== "" ? (
								<span aria-hidden="true" {...stylex.props(sureFont.base, menuStyles.shortcut)}>
									{item.shortcut}
								</span>
							) : null}
						</AriaMenuItem>
					)}
				</AriaMenu>
			</Popover>
		</MenuTrigger>
	);
}
