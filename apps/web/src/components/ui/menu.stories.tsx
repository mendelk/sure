// SureMenu stories: actions, destructive/disabled items, long labels.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureButton, SureMenu } from "~/components/ui";
import type { SureMenuItem } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const ITEMS: readonly SureMenuItem[] = [
	{ id: "edit", label: "Edit", shortcut: "E" },
	{ id: "duplicate", label: "Duplicate", shortcut: "D" },
	{ id: "archive", label: "Archive", isDisabled: true },
	{ id: "delete", label: "Delete", shortcut: "⌫", isDestructive: true },
];

const meta: Meta<typeof SureMenu> = {
	title: "Overlays/Menu",
	component: SureMenu,
	parameters: {
		docs: {
			description: {
				component:
					"Action menus with arrow-key navigation. The menu takes its accessible name from the trigger — triggers must always be labelled.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureMenu>;

export const Default: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureMenu trigger={<SureButton variant="secondary">Actions</SureButton>} items={ITEMS} />
			<SureMenu
				trigger={
					<SureButton variant="secondary" aria-label="More row actions">
						…
					</SureButton>
				}
				items={ITEMS}
			/>
		</div>
	),
};

export const LongLabels: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureMenu
				trigger={<SureButton variant="secondary">Actions</SureButton>}
				items={[
					{ id: "a", label: LONG_TEXT },
					{ id: "b", label: "Short item" },
				]}
			/>
		</div>
	),
};
