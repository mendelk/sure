// SureDialog + SurePopover stories: sizes, footers, long content, popovers.
import { DialogTrigger } from "react-aria-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureButton, SureDialog, SurePopover } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureDialog> = {
	title: "Overlays/Dialog",
	component: SureDialog,
	parameters: {
		docs: {
			description: {
				component:
					"Modal dialogs (focus trap, Escape, overlay dismiss, labelled heading) and labelled popovers. Never build overlays with raw fixed-position divs.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureDialog>;

export const WithFooter: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureDialog
				title="Delete account"
				trigger={<SureButton variant="destructive">Delete</SureButton>}
				footer={
					<>
						<SureButton variant="secondary">Cancel</SureButton>
						<SureButton variant="destructive">Delete account</SureButton>
					</>
				}
			>
				This permanently deletes the account and its history. This cannot be undone.
			</SureDialog>
		</div>
	),
};

export const Sizes: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureDialog
				title="Small dialog"
				size="sm"
				trigger={<SureButton variant="secondary">Small</SureButton>}
			>
				Compact confirmation.
			</SureDialog>
			<SureDialog
				title="Large dialog"
				size="lg"
				trigger={<SureButton variant="secondary">Large</SureButton>}
			>
				Room for tables and forms.
			</SureDialog>
		</div>
	),
};

export const LongContent: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<SureDialog
				title="Terms of service"
				trigger={<SureButton variant="secondary">Read terms</SureButton>}
				footer={<SureButton>Accept</SureButton>}
			>
				{LONG_TEXT} {LONG_TEXT} {LONG_TEXT} {LONG_TEXT}
			</SureDialog>
		</div>
	),
};

export const Popover: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.row)}>
			<DialogTrigger>
				<SureButton variant="secondary">Plan details</SureButton>
				<SurePopover label="Plan details" placement="bottom start">
					Renews monthly. Cancel anytime — {LONG_TEXT}
				</SurePopover>
			</DialogTrigger>
		</div>
	),
};
