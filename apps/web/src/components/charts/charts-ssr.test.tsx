// Chart SSR tests: server HTML contains the full SVG + data table.
//
// The TanStack React adapter server-renders the complete SVG at
// `initialWidth`; our environment hook resolves theme/motion in effects
// only, so the server string must already carry the accessible output with
// no browser globals touched. renderToString never runs effects — a throw
// here means the SSR path is broken.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllocationDonut } from "./allocation-donut";
import { CashFlowChart } from "./cash-flow-chart";
import { defaultChartLabels, withPrivacyMasking } from "./chart-format";
import { NetWorthChart } from "./net-worth-chart";

const LABELS = defaultChartLabels("de-DE", "EUR");

describe("chart server rendering", () => {
	it("renders net-worth SVG, table, and locale values to a string", () => {
		const html = renderToString(
			<NetWorthChart
				points={[
					{ month: "Jan", value: 12000 },
					{ month: "Feb", value: 12400 },
				]}
				title="Net worth"
				labels={LABELS}
			/>,
		);
		expect(html).toContain("<svg");
		expect(html).toContain("Net worth");
		expect(html).toContain("Feb");
		expect(html).toContain("12.400");
	});

	it("renders cash-flow and allocation to strings", () => {
		const cash = renderToString(
			<CashFlowChart
				points={[{ month: "Jan", series: "income", amount: 5200 }]}
				title="Cash flow"
				labels={LABELS}
			/>,
		);
		expect(cash).toContain("<svg");
		expect(cash).toContain("5.200");

		const allocation = renderToString(
			<AllocationDonut
				slices={[{ id: "stocks", label: "Stocks", amount: 6000 }]}
				title="Allocation"
				labels={LABELS}
			/>,
		);
		expect(allocation).toContain("<svg");
		expect(allocation).toContain("Stocks");
	});

	it("renders masked values (never raw amounts) in privacy mode", () => {
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		const html = renderToString(
			<NetWorthChart points={[{ month: "Jan", value: 12000 }]} title="Net worth" labels={masked} />,
		);
		expect(html).toContain("<svg");
		expect(html).toContain("•••");
		expect(html).not.toContain("12.000");
	});

	it("renders empty states to strings without a chart", () => {
		const html = renderToString(<NetWorthChart points={[]} title="Net worth" labels={LABELS} />);
		expect(html).not.toContain("<svg");
		expect(html).toContain("No net-worth data");
	});
});
