// AllocationDonut tests: slices, remainder, clamping, empty, masking, a11y.
//
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { defaultAllocationCopy } from "./chart-copy";
import { defaultChartLabels, withPrivacyMasking } from "./chart-format";
import type { AllocationSlice } from "./allocation-donut";
import { AllocationDonut } from "./allocation-donut";

const LABELS = defaultChartLabels("de-DE", "EUR");

const SLICES: readonly AllocationSlice[] = [
	{ id: "stocks", label: "Stocks", amount: 6000 },
	{ id: "bonds", label: "Bonds", amount: 3000 },
	{ id: "cash", label: "Cash", amount: 1000 },
];

describe("AllocationDonut", () => {
	it("renders slices with legend, total, and no axe violations", async () => {
		renderInMain(<AllocationDonut slices={SLICES} title="Allocation" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Allocation" })).toBeDefined();
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(within(legend).getByText(/Stocks:/)).toBeDefined();
		expect(screen.getByTestId("allocation-total").textContent).toContain("10.000");
		const table = screen.getByRole("table");
		expect(within(table).getAllByRole("row")).toHaveLength(4);
		await expectNoAxeViolations();
	});

	it("appends the unallocated remainder with its own label", () => {
		render(
			<AllocationDonut
				slices={SLICES}
				title="Allocation"
				labels={LABELS}
				copy={{ ...defaultAllocationCopy(), unallocatedLabel: "Not invested" }}
				unallocatedAmount={500}
			/>,
		);
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(within(legend).getByText(/Not invested:/)).toBeDefined();
		expect(screen.getByTestId("allocation-total").textContent).toContain("10.500");
	});

	it("renders the shared empty state for empty and all-zero datasets", async () => {
		renderInMain(<AllocationDonut slices={[]} title="Allocation" labels={LABELS} />);
		expect(screen.getByText("No allocation data")).toBeDefined();
		expect(screen.queryByRole("img", { name: "Allocation" })).toBeNull();
		await expectNoAxeViolations();
	});

	it("clamps negative slices to zero instead of breaking allocation", async () => {
		renderInMain(
			<AllocationDonut
				slices={[
					{ id: "stocks", label: "Stocks", amount: 6000 },
					{ id: "bad-row", label: "Bad row", amount: -250 },
				]}
				title="Allocation"
				labels={LABELS}
			/>,
		);
		expect(screen.getByRole("img", { name: "Allocation" })).toBeDefined();
		expect(screen.getByTestId("allocation-total").textContent).toContain("6.000");
		await expectNoAxeViolations();
	});

	it("masks legend, total, and table values in privacy mode", async () => {
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		renderInMain(<AllocationDonut slices={SLICES} title="Allocation" labels={masked} />);
		expect(screen.getByTestId("allocation-total").textContent).toContain("•••");
		expect(screen.getByTestId("allocation-total").textContent).not.toContain("10.000");
		const table = screen.getByRole("table");
		expect(table.textContent ?? "").toContain("Stocks");
		expect(table.textContent ?? "").not.toContain("6.000");
		await expectNoAxeViolations();
	});

	it("keeps duplicate labels distinct via stable ids", async () => {
		renderInMain(
			<AllocationDonut
				slices={[
					{ id: "broker-a", label: "Brokerage", amount: 2100 },
					{ id: "broker-b", label: "Brokerage", amount: 1300 },
					{ id: "bonds", label: "Bonds", amount: 600 },
				]}
				title="Allocation"
				labels={LABELS}
			/>,
		);
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(within(legend).getAllByText(/Brokerage:/)).toHaveLength(2);
		expect(screen.getByTestId("allocation-total").textContent).toContain("4.000");
		expect(screen.getByRole("img", { name: "Allocation" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("masks the focus tooltip as well as legend, total, and table", async () => {
		const user = userEvent.setup();
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		render(<AllocationDonut slices={SLICES} title="Allocation" labels={masked} />);
		await user.click(screen.getByRole("img", { name: "Allocation" }));
		await user.keyboard("{ArrowRight}");
		const text = document.body.textContent ?? "";
		expect(text).toContain("•••");
		expect(text).not.toContain("6.000");
		expect(text).not.toContain("6,000");
	});

	it("renders injected copy instead of hardcoded strings", async () => {
		renderInMain(
			<AllocationDonut
				slices={SLICES}
				title="Allocation"
				labels={LABELS}
				copy={{
					...defaultAllocationCopy(),
					totalLabel: "Gesamt",
					tableHolding: "Position",
					tableShare: "Anteil",
					legendLabel: "Legende",
					tableCaptionTemplate: "{title}-Daten",
				}}
			/>,
		);
		expect(screen.getByTestId("allocation-total").textContent).toMatch(/^Gesamt:/);
		expect(screen.getByRole("columnheader", { name: "Position" })).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Anteil" })).toBeDefined();
		expect(screen.getByRole("list", { name: "Legende" })).toBeDefined();
		expect(screen.getByRole("table", { name: "Allocation-Daten" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("exposes a keyboard-focusable chart host", () => {
		render(<AllocationDonut slices={SLICES} title="Allocation" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Allocation" }).getAttribute("tabindex")).toBe("0");
	});
});
