// SureCard stories: composition, footers, narrow widths, long text.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import {
	SureButton,
	SureCard,
	SureCardContent,
	SureCardDescription,
	SureCardFooter,
	SureCardHeader,
	SureCardTitle,
} from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureCard> = {
	title: "Layout/Card",
	component: SureCard,
	parameters: {
		docs: {
			description: {
				component:
					"Pure composition (Header/Title/Description/Content/Footer) — no behavior. Content semantics belong to the page, not the card.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureCard>;

export const Composition: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Balance</SureCardTitle>
					<SureCardDescription>Across all connected accounts</SureCardDescription>
				</SureCardHeader>
				<SureCardContent>12 400 € available, 1 230 € pending.</SureCardContent>
				<SureCardFooter>
					<SureButton variant="ghost">Dismiss</SureButton>
					<SureButton variant="secondary">Details</SureButton>
				</SureCardFooter>
			</SureCard>
		</div>
	),
};

export const NarrowAndLong: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>{LONG_TEXT}</SureCardTitle>
					<SureCardDescription>{LONG_TEXT}</SureCardDescription>
				</SureCardHeader>
				<SureCardContent>{LONG_TEXT}</SureCardContent>
				<SureCardFooter>
					<SureButton>OK</SureButton>
				</SureCardFooter>
			</SureCard>
		</div>
	),
};
