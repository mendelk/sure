// Sure chart prototypes: TanStack evaluation stories (t_alt_fnd_016).
//
// One story per chart × state (default, privacy-masked, empty, edge case).
// Labels are injected per story (de-DE/EUR default, masked variant via
// withPrivacyMasking) — the t_alt_fnd_011 foundation will supply these from
// shared context later; stories switch to that source without chart changes.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import { AllocationDonut } from "./allocation-donut";
import type { AllocationSlice } from "./allocation-donut";
import { CashFlowChart } from "./cash-flow-chart";
import type { CashFlowPoint } from "./cash-flow-chart";
import { defaultChartLabels, withPrivacyMasking } from "./chart-format";
import { defaultNetWorthCopy } from "./chart-copy";
import { NetWorthChart } from "./net-worth-chart";
import type { NetWorthPoint } from "./net-worth-chart";
import { LONG_TEXT, storyLayout } from "../ui/storybook-layout";

const LABELS = defaultChartLabels("de-DE", "EUR");
const MASKED = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));

const NET_WORTH: readonly NetWorthPoint[] = [
	{ month: "Jan", value: 48200 },
	{ month: "Feb", value: 49750 },
	{ month: "Mar", value: 47300 },
	{ month: "Apr", value: 51100 },
	{ month: "May", value: 52800 },
	{ month: "Jun", value: 51900 },
	{ month: "Jul", value: 54400 },
	{ month: "Aug", value: 56100 },
	{ month: "Sep", value: 55250 },
	{ month: "Oct", value: 57800 },
	{ month: "Nov", value: 59300 },
	{ month: "Dec", value: 61150 },
];

const CASH_FLOW: readonly CashFlowPoint[] = [
	{ month: "Jan", series: "income", amount: 5200 },
	{ month: "Jan", series: "expenses", amount: 3100 },
	{ month: "Feb", series: "income", amount: 5400 },
	{ month: "Feb", series: "expenses", amount: 2950 },
	{ month: "Mar", series: "income", amount: 5100 },
	{ month: "Mar", series: "expenses", amount: 3300 },
	{ month: "Apr", series: "income", amount: 5600 },
	{ month: "Apr", series: "expenses", amount: 3050 },
];

const ALLOCATION: readonly AllocationSlice[] = [
	{ id: "stocks", label: "Stocks", amount: 34200 },
	{ id: "bonds", label: "Bonds", amount: 12800 },
	{ id: "real-estate", label: "Real estate", amount: 9600 },
	{ id: "cash", label: "Cash", amount: 4400 },
];

const meta: Meta = {
	title: "Charts/Sure",
	parameters: {
		docs: {
			description: {
				component:
					"TanStack Charts evaluation prototypes (t_alt_fnd_016): net-worth line/area, grouped cash-flow bars, allocation donut. Application-owned props only — no Alpha imports in feature code.",
			},
		},
	},
};

export default meta;
type Story = StoryObj;

function ChartFrame({ children }: { children: React.ReactNode }): React.ReactElement {
	return <div {...stylex.props(storyLayout.column)}>{children}</div>;
}

export const NetWorth: Story = {
	render: () => (
		<ChartFrame>
			<NetWorthChart
				points={NET_WORTH}
				title="Net worth"
				description="Household net worth across the last twelve months."
				labels={LABELS}
			/>
		</ChartFrame>
	),
};

export const NetWorthMasked: Story = {
	render: () => (
		<ChartFrame>
			<NetWorthChart
				points={NET_WORTH}
				title="Net worth"
				description="Privacy mode: every value is masked."
				labels={MASKED}
			/>
		</ChartFrame>
	),
};

export const NetWorthNegative: Story = {
	render: () => (
		<ChartFrame>
			<NetWorthChart
				points={[
					{ month: "Jan", value: -2500 },
					{ month: "Feb", value: -800 },
					{ month: "Mar", value: 1200 },
					{ month: "Apr", value: 3400 },
				]}
				title="Net worth"
				description="Recovery from negative net worth."
				labels={LABELS}
			/>
		</ChartFrame>
	),
};

export const NetWorthEmpty: Story = {
	render: () => (
		<ChartFrame>
			<NetWorthChart points={[]} title="Net worth" labels={LABELS} />
		</ChartFrame>
	),
};

export const CashFlow: Story = {
	render: () => (
		<ChartFrame>
			<CashFlowChart
				points={CASH_FLOW}
				title="Cash flow"
				description="Monthly income against expenses."
				labels={LABELS}
			/>
		</ChartFrame>
	),
};

export const CashFlowMasked: Story = {
	render: () => (
		<ChartFrame>
			<CashFlowChart
				points={CASH_FLOW}
				title="Cash flow"
				description="Privacy mode: every value is masked."
				labels={MASKED}
			/>
		</ChartFrame>
	),
};

export const CashFlowEmpty: Story = {
	render: () => (
		<ChartFrame>
			<CashFlowChart points={[]} title="Cash flow" labels={LABELS} />
		</ChartFrame>
	),
};

export const Allocation: Story = {
	render: () => (
		<ChartFrame>
			<AllocationDonut
				slices={ALLOCATION}
				title="Allocation"
				description="Portfolio allocation by asset class."
				labels={LABELS}
				unallocatedAmount={1200}
			/>
		</ChartFrame>
	),
};

export const AllocationMasked: Story = {
	render: () => (
		<ChartFrame>
			<AllocationDonut
				slices={ALLOCATION}
				title="Allocation"
				description="Privacy mode: every value is masked."
				labels={MASKED}
				unallocatedAmount={1200}
			/>
		</ChartFrame>
	),
};

export const AllocationEmpty: Story = {
	render: () => (
		<ChartFrame>
			<AllocationDonut slices={[]} title="Allocation" labels={LABELS} />
		</ChartFrame>
	),
};

export const AllocationLongLabels: Story = {
	render: () => (
		<ChartFrame>
			<AllocationDonut
				slices={[
					{ id: "long", label: LONG_TEXT, amount: 34200 },
					{ id: "bonds", label: "Bonds", amount: 12800 },
				]}
				title="Allocation"
				description="Long slice labels must wrap in the legend without breaking layout."
				labels={LABELS}
			/>
		</ChartFrame>
	),
};

export const AllocationDuplicateLabels: Story = {
	render: () => (
		<ChartFrame>
			<AllocationDonut
				slices={[
					{ id: "broker-a", label: "Brokerage", amount: 21000 },
					{ id: "broker-b", label: "Brokerage", amount: 13200 },
					{ id: "bonds", label: "Bonds", amount: 12800 },
				]}
				title="Allocation"
				description="Duplicate holding names stay distinct slices via stable ids."
				labels={LABELS}
			/>
		</ChartFrame>
	),
};

const NET_WORTH_COPY_DE = {
	...defaultNetWorthCopy(),
	axisBase: "Nettovermögen",
	summaryTemplate: "Nettovermögen über {count} Monate.",
	emptyTitle: "Keine Nettovermögensdaten",
	emptyDescription: "Das Nettovermögen erscheint hier, sobald Bewertungen verfügbar sind.",
	selectedPrefix: "Ausgewählt",
	tableMonth: "Monat",
	tableValueBase: "Wert",
	tableCaptionTemplate: "{title}-Daten",
	tooltipValueLabel: "Nettovermögen",
};

export const NetWorthLocalized: Story = {
	render: () => (
		<ChartFrame>
			<NetWorthChart
				points={NET_WORTH}
				title="Nettovermögen"
				description="Das Haushaltsnettovermögen der letzten zwölf Monate."
				labels={defaultChartLabels("de-DE", "EUR")}
				copy={NET_WORTH_COPY_DE}
			/>
		</ChartFrame>
	),
};
