// SureSkeleton + SureEmptyState stories: loading regions and zero states.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureButton, SureEmptyState, SureSkeleton } from "~/components/ui";
import { storyLayout } from "./storybook-layout";

const meta: Meta<typeof SureSkeleton> = {
	title: "Feedback/Loading",
	component: SureSkeleton,
	parameters: {
		docs: {
			description: {
				component:
					"Loading regions (aria-busy, shimmer collapses under reduced motion) and empty states (labelled section + one action).",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureSkeleton>;

export const Skeletons: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureSkeleton label="Loading transactions" lines={3} />
			<SureSkeleton label="Loading chart" lines={5} />
		</div>
	),
};

export const EmptyStates: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureEmptyState
				title="No transactions yet"
				description="Import a CSV or connect a bank to get started."
				action={<SureButton variant="secondary">Import CSV</SureButton>}
			/>
			<SureEmptyState
				title="Nothing matches"
				description="Try clearing the search or choosing another month."
			/>
		</div>
	),
};
