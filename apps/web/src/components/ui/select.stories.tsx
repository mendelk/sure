// SureSelect + SureCombobox stories: fixed vs filterable choice.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { SureCombobox, SureSelect } from "~/components/ui";
import type { SureOption } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

const COUNTRIES: readonly SureOption[] = [
	{ id: "de", label: "Germany" },
	{ id: "fr", label: "France" },
	{ id: "jp", label: "Japan" },
	{ id: "br", label: "Brazil" },
	{ id: "xx", label: "Closed region (disabled)", isDisabled: true },
];

const meta: Meta<typeof SureSelect> = {
	title: "Forms/Select",
	component: SureSelect,
	parameters: {
		docs: {
			description: {
				component:
					"Select for short fixed lists, combobox for long/filterable ones. Keyboard: arrows + type-ahead + Enter/Escape. Failures via errorMessage, never plain text.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureSelect>;

export const Select: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureSelect label="Country" items={COUNTRIES} />
			<SureSelect
				label="Required country"
				items={COUNTRIES}
				isRequired
				description="Used for tax reporting."
			/>
		</div>
	),
};

export const SelectInvalid: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureSelect label="Country" items={COUNTRIES} errorMessage="Pick a country to continue." />
		</div>
	),
};

export const Combobox: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.column)}>
			<SureCombobox label="Country" items={COUNTRIES} description="Type to filter a long list." />
			<SureCombobox
				label="Country with failure"
				items={COUNTRIES}
				errorMessage="No option matches — clear the search."
			/>
		</div>
	),
};

export const LongLabels: Story = {
	render: () => (
		<div {...stylex.props(storyLayout.narrow)}>
			<SureSelect
				label={LONG_TEXT}
				items={[
					{ id: "a", label: LONG_TEXT },
					{ id: "b", label: "Short option" },
				]}
			/>
			<SureCombobox label={LONG_TEXT} items={COUNTRIES} errorMessage={LONG_TEXT} />
		</div>
	),
};
