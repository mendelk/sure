// NetWorthChart tests: render, empty, negative, large, masking, a11y.
//
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { defaultNetWorthCopy } from "./chart-copy";
import { defaultChartLabels, withPrivacyMasking } from "./chart-format";
import type { NetWorthPoint } from "./net-worth-chart";
import { NetWorthChart } from "./net-worth-chart";

const LABELS = defaultChartLabels("de-DE", "EUR");

const POINTS: readonly NetWorthPoint[] = [
	{ month: "Jan", value: 12000 },
	{ month: "Feb", value: 12400 },
	{ month: "Mar", value: 11800 },
];

function tableBody(): HTMLElement {
	const table = screen.getByRole("table");
	return within(table).getAllByRole("rowgroup")[1] ?? table;
}

describe("NetWorthChart", () => {
	it("renders an accessible figure with chart, table, and no axe violations", async () => {
		renderInMain(<NetWorthChart points={POINTS} title="Net worth" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Net worth" })).toBeDefined();
		const rows = within(tableBody()).getAllByRole("row");
		expect(rows).toHaveLength(3);
		expect(screen.getByRole("cell", { name: "Feb" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("exposes a keyboard-focusable chart host", () => {
		render(<NetWorthChart points={POINTS} title="Net worth" labels={LABELS} />);
		const host = screen.getByRole("img", { name: "Net worth" });
		expect(host.getAttribute("tabindex")).toBe("0");
	});

	it("renders the shared empty state without a chart", async () => {
		renderInMain(<NetWorthChart points={[]} title="Net worth" labels={LABELS} />);
		expect(screen.getByText("No net-worth data")).toBeDefined();
		expect(screen.queryByRole("img", { name: "Net worth" })).toBeNull();
		await expectNoAxeViolations();
	});

	it("renders negative values without axe violations", async () => {
		renderInMain(
			<NetWorthChart
				points={[
					{ month: "Jan", value: -2500 },
					{ month: "Feb", value: 300 },
				]}
				title="Net worth"
				labels={LABELS}
			/>,
		);
		expect(screen.getByRole("img", { name: "Net worth" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("renders a large dataset with one table row per point", () => {
		const many: NetWorthPoint[] = Array.from({ length: 500 }, (_, index) => ({
			month: `M${String(index)}`,
			value: 10000 + index * 10,
		}));
		render(<NetWorthChart points={many} title="Net worth" labels={LABELS} />);
		expect(screen.getByRole("img", { name: "Net worth" })).toBeDefined();
		expect(within(tableBody()).getAllByRole("row")).toHaveLength(500);
	});

	it("masks every value in privacy mode", async () => {
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		renderInMain(<NetWorthChart points={POINTS} title="Net worth" labels={masked} />);
		const table = screen.getByRole("table");
		const text = table.textContent ?? "";
		// Month names stay readable; formatted amounts must not leak.
		expect(text).toContain("Feb");
		expect(text).not.toContain("12.400");
		expect(text).not.toContain("11.800");
		const cells = within(table).getAllByRole("cell");
		const valueCells = cells.filter((_, index) => index % 2 === 1);
		expect(valueCells).toHaveLength(3);
		for (const cell of valueCells) {
			expect(cell.textContent).toBe("•••");
		}
		await expectNoAxeViolations();
	});

	it("masks the focus tooltip as well as tables and axes", async () => {
		const user = userEvent.setup();
		const masked = withPrivacyMasking(defaultChartLabels("de-DE", "EUR"));
		render(<NetWorthChart points={POINTS} title="Net worth" labels={masked} />);
		await user.click(screen.getByRole("img", { name: "Net worth" }));
		await user.keyboard("{ArrowRight}{ArrowRight}");
		const text = document.body.textContent ?? "";
		expect(text).toContain("•••");
		// Keyboard focus opens the tooltip on the first point (Jan, 12000):
		// its raw value must not appear in any locale formatting.
		expect(text).not.toContain("12.000");
		expect(text).not.toContain("12,000");
	});

	it("renders injected copy instead of hardcoded strings", async () => {
		const user = userEvent.setup();
		renderInMain(
			<NetWorthChart
				points={POINTS}
				title="Nettovermögen"
				labels={LABELS}
				copy={{
					...defaultNetWorthCopy(),
					axisBase: "Nettovermögen",
					selectedPrefix: "Ausgewählt",
					tableMonth: "Monat",
					tableValueBase: "Wert",
					tableCaptionTemplate: "{title}-Daten",
				}}
			/>,
		);
		expect(screen.getByText("Nettovermögen (EUR)")).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Monat" })).toBeDefined();
		expect(screen.getByRole("columnheader", { name: "Wert (EUR)" })).toBeDefined();
		expect(screen.getByRole("table", { name: "Nettovermögen-Daten" })).toBeDefined();
		await user.click(screen.getByRole("img", { name: "Nettovermögen" }));
		await user.keyboard("{ArrowRight}{Enter}");
		expect(screen.getByTestId("net-worth-selection").textContent).toMatch(/^Ausgewählt /);
		await expectNoAxeViolations();
	});
});
