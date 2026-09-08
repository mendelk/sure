// SureTextField stories: labels, hints, failures, multiline, narrow widths.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureTextField } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureTextField> = {
	title: "Forms/TextField",
	component: SureTextField,
	parameters: {
		docs: {
			description: {
				component:
					"Labeled input/textarea with description + assertive error wiring. Always pass label; pair errorMessage with isInvalid.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureTextField>;

export const Default: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTextField label="Email" type="email" placeholder="you@example.com" />
			<SureTextField label="Required name" isRequired placeholder="Ada Lovelace" />
		</div>
	),
};

export const WithDescription: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTextField
				label="API origin"
				description="Absolute https origin of the Sure API, without path or credentials."
				placeholder="https://api.example.com"
			/>
		</div>
	),
};

export const Invalid: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTextField label="Email" isInvalid errorMessage="Enter a valid email address." />
			<SureTextField
				label="Password"
				type="password"
				isInvalid
				errorMessage="Use at least 12 characters with a number and a symbol."
			/>
		</div>
	),
};

export const Multiline: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTextField label="Notes" multiline placeholder="Anything worth remembering…" />
			<SureTextField
				label="Biography"
				multiline
				isInvalid
				errorMessage="Keep it under 280 characters."
			/>
		</div>
	),
};

export const Disabled: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureTextField label="Account ID" isDisabled defaultValue="acc_01HQ" />
		</div>
	),
};

export const NarrowAndLongLabels: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureTextField label={LONG_TEXT} placeholder="Wraps, never clips" />
			<SureTextField label="Short" isInvalid errorMessage={LONG_TEXT} />
		</div>
	),
};
