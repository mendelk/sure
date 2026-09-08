// SureTabs tests: selection, arrow-key navigation, disabled tabs, a11y.
//
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureTabs } from "./tabs";

const ITEMS = [
	{ id: "overview", label: "Overview", children: "Overview panel" },
	{ id: "activity", label: "Activity", children: "Activity panel" },
	{ id: "settings", label: "Settings", children: "Settings panel", isDisabled: true },
] as const;

describe("SureTabs", () => {
	it("switches panels with arrow keys", async () => {
		const user = userEvent.setup();
		renderInMain(<SureTabs label="Account sections" items={ITEMS.map((item) => ({ ...item }))} />);
		const tablist = screen.getByRole("tablist", { name: "Account sections" });
		expect(tablist).toBeDefined();
		expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview panel");
		const overview = screen.getByRole("tab", { name: "Overview" });
		overview.focus();
		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Activity");
		expect(screen.getByRole("tabpanel")).toHaveTextContent("Activity panel");
	});

	it("marks disabled tabs and has no axe violations", async () => {
		renderInMain(<SureTabs label="Account sections" items={ITEMS.map((item) => ({ ...item }))} />);
		expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-disabled", "true");
		await expectNoAxeViolations();
	});
});
