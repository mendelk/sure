// Chart definition stability: selection re-renders must not rebuild the
// TanStack definition (t_alt_fnd_016 review follow-up).
//
// Each chart memoizes its copy defaults and theme mapping, so a selection
// state update re-renders with identical definition inputs. This suite
// counts `defineChart` invocations across a real keyboard selection and
// fails if the interaction rebuilds the scene (wasted pie/layout work and
// risk of resetting the adapter's internal interaction state).
//
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AllocationDonut } from "./allocation-donut";
import { CashFlowChart } from "./cash-flow-chart";
import { defaultChartLabels } from "./chart-format";
import { NetWorthChart } from "./net-worth-chart";

const { definitionBuilds } = vi.hoisted(() => ({ definitionBuilds: [] as unknown[] }));

vi.mock("@tanstack/charts", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@tanstack/charts")>();
	// Proxy preserves the wrapped signature exactly (no casts, no any)
	// while counting invocations; behavior is otherwise identical.
	const defineChart = new Proxy(mod.defineChart, {
		apply(target, thisArg, args) {
			definitionBuilds.push(args);
			return Reflect.apply(target, thisArg, args) as unknown;
		},
	});
	return { ...mod, defineChart };
});

const LABELS = defaultChartLabels("de-DE", "EUR");

async function keyboardSelect(chartName: string): Promise<void> {
	const user = userEvent.setup();
	await user.click(screen.getByRole("img", { name: chartName }));
	await user.keyboard("{ArrowRight}{Enter}");
}

describe("chart definition stability", () => {
	it("net-worth selection does not rebuild the definition", async () => {
		render(
			<NetWorthChart
				points={[
					{ month: "Jan", value: 12000 },
					{ month: "Feb", value: 12400 },
				]}
				title="Net worth"
				labels={LABELS}
			/>,
		);
		expect(definitionBuilds.length).toBeGreaterThan(0);
		definitionBuilds.length = 0;
		await keyboardSelect("Net worth");
		expect(screen.getByTestId("net-worth-selection")).toBeDefined();
		expect(definitionBuilds).toHaveLength(0);
	});

	it("cash-flow selection does not rebuild the definition", async () => {
		render(
			<CashFlowChart
				points={[
					{ month: "Jan", series: "income", amount: 5200 },
					{ month: "Jan", series: "expenses", amount: 3100 },
				]}
				title="Cash flow"
				labels={LABELS}
			/>,
		);
		definitionBuilds.length = 0;
		await keyboardSelect("Cash flow");
		expect(screen.getByTestId("cash-flow-selection")).toBeDefined();
		expect(definitionBuilds).toHaveLength(0);
	});

	it("allocation selection does not rebuild the definition", async () => {
		render(
			<AllocationDonut
				slices={[
					{ id: "stocks", label: "Stocks", amount: 6000 },
					{ id: "bonds", label: "Bonds", amount: 3000 },
				]}
				title="Allocation"
				labels={LABELS}
			/>,
		);
		definitionBuilds.length = 0;
		await keyboardSelect("Allocation");
		expect(screen.getByTestId("allocation-selection")).toBeDefined();
		expect(definitionBuilds).toHaveLength(0);
	});
});
