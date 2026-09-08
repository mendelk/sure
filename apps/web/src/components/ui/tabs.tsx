// SureTabs (apps/web).
//
// Tabbed content with automatic arrow-key navigation, tablist semantics,
// and lazy-friendly panels from React Aria. Never rebuild tabs with raw
// buttons + conditional divs.
import {
	Tab as AriaTab,
	TabList as AriaTabList,
	TabPanel as AriaTabPanel,
	Tabs as AriaTabs,
} from "react-aria-components";
import type { TabsProps as AriaTabsProps } from "react-aria-components";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont } from "./sure-styles";

export interface SureTabItem {
	id: string;
	label: string;
	isDisabled?: boolean;
	children: React.ReactNode;
}

export interface SureTabsProps extends Omit<AriaTabsProps, "children" | "className" | "style"> {
	/** Accessible label for the tab list. */
	label: string;
	items: readonly SureTabItem[];
}

const tabsStyles = stylex.create({
	list: {
		display: "flex",
		gap: 4,
		padding: 4,
		backgroundColor: vars.tabBgGroup,
		borderRadius: vars.radiusMd,
		overflowX: "auto",
	},
	tab: {
		flexShrink: 0,
		paddingBlock: 8,
		paddingInline: 14,
		fontSize: 14,
		fontWeight: vars.fontWeightMedium,
		// Muted but still ≥4.5:1 on the tab group surface (textSecondary
		// is 4.4:1 there and fails axe color-contrast).
		color: vars.textSecondaryStrong,
		backgroundColor: "transparent",
		borderStyle: "none",
		borderWidth: 0,
		borderRadius: 6,
		cursor: "pointer",
		whiteSpace: "nowrap",
		":hover": {
			backgroundColor: vars.tabItemHover,
			color: vars.textPrimary,
		},
		"[data-selected=true]": {
			backgroundColor: vars.tabItemActive,
			color: vars.textPrimary,
			boxShadow: vars.shadowXs,
		},
		"[data-disabled=true]": {
			color: vars.textSubdued,
			cursor: "not-allowed",
		},
	},
	panel: {
		paddingBlock: 16,
		fontSize: 14,
		color: vars.textPrimary,
		outlineStyle: "none",
	},
});

export function SureTabs({ label, items, ...rest }: SureTabsProps): React.ReactElement {
	return (
		<AriaTabs {...rest} {...stylex.props(sureFont.base)}>
			<AriaTabList aria-label={label} {...stylex.props(tabsStyles.list)}>
				{items.map((item) => (
					<AriaTab
						key={item.id}
						id={item.id}
						{...(item.isDisabled === true ? { isDisabled: true } : null)}
						{...stylex.props(tabsStyles.tab, sureFocus.ring)}
					>
						{item.label}
					</AriaTab>
				))}
			</AriaTabList>
			{items.map((item) => (
				<AriaTabPanel key={item.id} id={item.id} {...stylex.props(tabsStyles.panel)}>
					{item.children}
				</AriaTabPanel>
			))}
		</AriaTabs>
	);
}
