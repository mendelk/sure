// SureTabs stories: panels, overflow, disabled tabs, long labels.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureTabs } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureTabs> = {
	title: "Navigation/Tabs",
	component: SureTabs,
	parameters: {
		docs: {
			description: {
				component:
					"Tabbed content with automatic arrow-key navigation. Never rebuild tabs with raw buttons + conditional divs.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureTabs>;

export const Default: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTabs
				label="Account sections"
				items={[
					{ id: "overview", label: "Overview", children: "Balance across all accounts." },
					{ id: "activity", label: "Activity", children: "Latest transactions land here." },
					{ id: "settings", label: "Settings", children: "Notifications and exports." },
				]}
			/>
		</div>
	),
};

export const ManyTabs: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTabs
				label="Report sections"
				items={[
					"Overview",
					"Income",
					"Expenses",
					"Investments",
					"Taxes",
					"Forecasts",
					"Archive",
					"Settings",
				].map((label, index) => ({
					id: `tab-${index}`,
					label,
					children: `Panel: ${label}.`,
				}))}
			/>
		</div>
	),
};

export const DisabledTab: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTabs
				label="Account sections"
				items={[
					{ id: "overview", label: "Overview", children: "Visible to everyone." },
					{
						id: "audit",
						label: "Audit log",
						children: "Requires the admin role.",
						isDisabled: true,
					},
				]}
			/>
		</div>
	),
};

export const LongLabels: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureTabs
				label="Sections"
				items={[
					{ id: "a", label: LONG_TEXT, children: "First panel." },
					{ id: "b", label: "Short", children: "Second panel." },
				]}
			/>
		</div>
	),
};
