// SureButton + SureLink stories: variants, sizes, states, long text.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureButton, SureLink } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureButton> = {
	title: "Actions/Button",
	component: SureButton,
	parameters: {
		docs: {
			description: {
				component:
					"Single accessible button/link system. Feature code must not invent new button shapes — extend SureButtonVariant instead (see COMPOSITION.md).",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureButton>;

export const Variants: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureButton variant="primary">Primary</SureButton>
			<SureButton variant="secondary">Secondary</SureButton>
			<SureButton variant="secondary-strong">Strong</SureButton>
			<SureButton variant="destructive">Destructive</SureButton>
			<SureButton variant="ghost">Ghost</SureButton>
			<SureButton variant="outline">Outline</SureButton>
		</div>
	),
};

export const Sizes: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureButton size="sm">Small</SureButton>
			<SureButton size="md">Medium</SureButton>
			<SureButton size="lg">Large</SureButton>
		</div>
	),
};

export const States: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureButton isDisabled>Disabled</SureButton>
			<SureButton isPending>Saving</SureButton>
			<SureButton variant="secondary" isPending>
				Loading secondary
			</SureButton>
		</div>
	),
};

export const LongLabel: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureButton>{LONG_TEXT}</SureButton>
			<SureButton variant="secondary">{LONG_TEXT}</SureButton>
		</div>
	),
};

export const Links: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<p {...stylex.props(storyLayout.caption)}>
				Read the <SureLink href="https://example.com">documentation</SureLink> or{" "}
				<SureLink href="https://example.com" variant="subtle">
					browse the subtle release notes
				</SureLink>
				.
			</p>
			<p {...stylex.props(storyLayout.caption)}>{LONG_TEXT}</p>
		</div>
	),
};
