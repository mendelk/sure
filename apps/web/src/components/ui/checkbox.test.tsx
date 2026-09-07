// SureCheckbox + SureSwitch tests: toggle behavior, indeterminate, a11y.
//
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureCheckbox, SureSwitch } from "./checkbox";

describe("SureCheckbox", () => {
	it("toggles with click and Space without axe violations", async () => {
		const user = userEvent.setup();
		renderInMain(<SureCheckbox>Subscribe</SureCheckbox>);
		const box = screen.getByRole("checkbox", { name: "Subscribe" });
		expect(box).not.toBeChecked();
		await user.click(box);
		expect(box).toBeChecked();
		box.focus();
		await user.keyboard(" ");
		expect(box).not.toBeChecked();
		await expectNoAxeViolations();
	});

	it("exposes indeterminate state to assistive tech", async () => {
		render(<SureCheckbox isIndeterminate>All folders</SureCheckbox>);
		const box = screen.getByRole("checkbox", { name: "All folders" });
		expect(box).toBePartiallyChecked();
	});
});

describe("SureSwitch", () => {
	it("toggles with keyboard without axe violations", async () => {
		const user = userEvent.setup();
		renderInMain(<SureSwitch>Dark mode</SureSwitch>);
		const toggle = screen.getByRole("switch", { name: "Dark mode" });
		expect(toggle).not.toBeChecked();
		toggle.focus();
		await user.keyboard(" ");
		expect(toggle).toBeChecked();
		await expectNoAxeViolations();
	});
});
