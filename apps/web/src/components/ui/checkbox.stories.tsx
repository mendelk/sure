// SureCheckbox + SureSwitch stories: toggles, indeterminate, disabled.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureCheckbox, SureSwitch } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureCheckbox> = {
	title: "Forms/Toggles",
	component: SureCheckbox,
	parameters: {
		docs: {
			description: {
				component:
					"The only toggles in the system — never hand-roll checkbox/switch divs. Space toggles; indeterminate is exposed as aria-checked=mixed.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureCheckbox>;

export const Checkboxes: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureCheckbox>Subscribe to the changelog</SureCheckbox>
			<SureCheckbox defaultSelected>Preselected</SureCheckbox>
			<SureCheckbox isIndeterminate>All folders (partial)</SureCheckbox>
			<SureCheckbox isDisabled>Disabled off</SureCheckbox>
			<SureCheckbox isDisabled defaultSelected>
				Disabled on
			</SureCheckbox>
		</div>
	),
};

export const Switches: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureSwitch>Dark mode</SureSwitch>
			<SureSwitch defaultSelected>Email notifications</SureSwitch>
			<SureSwitch isDisabled>Disabled</SureSwitch>
		</div>
	),
};

export const LongLabels: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureCheckbox>{LONG_TEXT}</SureCheckbox>
			<SureSwitch>{LONG_TEXT}</SureSwitch>
		</div>
	),
};
