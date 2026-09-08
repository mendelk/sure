// CashFlowChart tests: grouped render, legend totals, edge cases, a11y.
//
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { defaultCashFlowCopy } from "./chart-copy";
import { defaultChartLabels, withPrivacyMasking } from "./chart-format";
import type { CashFlowPoint } from "./cash-flow-chart";
import { CashFlowChart } from "./cash-flow-chart";

const LABELS = defaultChartLabels("de-DE", "EUR");

const POINTS: readonly CashFlowPoint[] = [
	{ month: "Jan", series: "income", amount: 5200 },
	{ month: "Jan", series: "expenses", amount: 3100 },
	{ month: "Feb", series: "income", amount: 5400 },
	{ month: "Feb", series: "expenses", amount: 2900 },
];

describe("CashFlowChart", () => {
	it("renders grouped bars with legend totals and no axe violations", async () => {
		renderInMain(<CashFlowChart points={POINTS} title="Cash flow" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Cash flow" })).toBeDefined();
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(within(legend).getByText(/Income:/)).toBeDefined();
		expect(within(legend).getByText(/Expenses:/)).toBeDefined();
		const table = screen.getByRole("table");
		expect(within(table).getAllByRole("row")).toHaveLength(5);
		await expectNoAxeViolations();
	});

	it("renders the shared empty state without a chart", async () => {
		renderInMain(<CashFlowChart points={[]} title="Cash flow" labels={LABELS} />);
		expect(screen.getByText("No cash-flow data")).toBeDefined();
		expect(screen.queryByRole("img", { name: "Cash flow" })).toBeNull();
		await expectNoAxeViolations();
	});

	it("renders negative amounts without axe violations", async () => {
		renderInMain(
			<CashFlowChart
				points={[
					{ month: "Jan", series: "income", amount: 5200 },
					{ month: "Jan", series: "expenses", amount: -400 },
				]}
				title="Cash flow"
				labels={LABELS}
			/>,
		);
		expect(screen.getByRole("img", { name: "Cash flow" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("masks legend totals and table values in privacy mode", async () => {
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		renderInMain(<CashFlowChart points={POINTS} title="Cash flow" labels={masked} />);
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(legend.textContent ?? "").not.toContain("5.200");
		const table = screen.getByRole("table");
		expect(table.textContent ?? "").not.toContain("5.200");
		expect(table.textContent ?? "").toContain("Jan");
		await expectNoAxeViolations();
	});

	it("masks the focus tooltip as well as legend and table", async () => {
		const user = userEvent.setup();
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		render(<CashFlowChart points={POINTS} title="Cash flow" labels={masked} />);
		await user.click(screen.getByRole("img", { name: "Cash flow" }));
		await user.keyboard("{ArrowRight}");
		const text = document.body.textContent ?? "";
		expect(text).toContain("•••");
		expect(text).not.toContain("5.200");
		expect(text).not.toContain("5,200");
	});

	it("renders injected copy instead of hardcoded strings", async () => {
		renderInMain(
			<CashFlowChart
				points={POINTS}
				title="Cash flow"
				labels={LABELS}
				copy={{
					...defaultCashFlowCopy(),
					seriesIncome: "Einnahmen",
					seriesExpenses: "Ausgaben",
					legendLabel: "Legende",
					tableCaptionTemplate: "{title}-Daten",
				}}
			/>,
		);
		const legend = screen.getByRole("list", { name: "Legende" });
		expect(within(legend).getByText(/Einnahmen:/)).toBeDefined();
		expect(within(legend).getByText(/Ausgaben:/)).toBeDefined();
		expect(screen.getByRole("table", { name: "Cash flow-Daten" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("exposes a keyboard-focusable chart host", () => {
		render(<CashFlowChart points={POINTS} title="Cash flow" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Cash flow" }).getAttribute("tabindex")).toBe("0");
	});
});
