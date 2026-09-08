// SureAlert + SureBadge stories: tones, titles, long text.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureAlert, SureBadge } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureAlert> = {
	title: "Feedback/Alert",
	component: SureAlert,
	parameters: {
		docs: {
			description: {
				component:
					"Assertive (destructive → role=alert) vs polite (status) feedback. Badges are non-assertive text — see Feedback/Badge.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureAlert>;

export const Tones: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureAlert tone="info" title="Sync complete">
				412 transactions imported.
			</SureAlert>
			<SureAlert tone="success" title="Saved">
				All changes stored.
			</SureAlert>
			<SureAlert tone="warning" title="Connection expiring">
				Reconnect SimpleFIN before Friday.
			</SureAlert>
			<SureAlert tone="destructive" title="Import failed">
				The CSV is missing a date column.
			</SureAlert>
			<SureAlert tone="neutral">A neutral note without a title.</SureAlert>
		</div>
	),
};

export const LongText: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureAlert tone="warning" title="Heads up">
				{LONG_TEXT}
			</SureAlert>
		</div>
	),
};

export const Badges: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureBadge tone="neutral">Draft</SureBadge>
			<SureBadge tone="info">Synced</SureBadge>
			<SureBadge tone="success">Paid</SureBadge>
			<SureBadge tone="warning">Due soon</SureBadge>
			<SureBadge tone="destructive">Overdue</SureBadge>
			<SureBadge tone="info">{LONG_TEXT}</SureBadge>
		</div>
	),
};
