// SureCheckbox + SureSwitch tests: toggle behavior, indeterminate, a11y.
//
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureCheckbox, SureSwitch } from "./checkbox";

/**
 * The decorative visual is the first aria-hidden span inside the toggle
 * label (the checkbox box / switch track). React Aria keeps selection
 * state on the root; Sure mirrors it here as data attributes so the
 * compiled StyleX `[data-selected=true]` visuals track render state.
 */
function decorativeVisual(input: HTMLElement): HTMLElement {
	const label = input.closest("label");
	if (label === null) {
		throw new Error("Expected the toggle input to render inside a <label>.");
	}
	const visual = label.querySelector(":scope > span[aria-hidden='true']");
	if (!(visual instanceof HTMLElement)) {
		throw new Error("Expected a decorative visual span inside the toggle label.");
	}
	return visual;
}

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

	it("mirrors selection state onto the decorative box visual", async () => {
		const user = userEvent.setup();
		renderInMain(<SureCheckbox>Subscribe</SureCheckbox>);
		const box = screen.getByRole("checkbox", { name: "Subscribe" });
		const visual = decorativeVisual(box);
		// Resting: no selected marker, no glyph.
		expect(visual).not.toHaveAttribute("data-selected");
		expect(visual.querySelector("svg")).toBeNull();
		await user.click(box);
		// Selected: the box carries data-selected so the compiled
		// `[data-selected=true]` fill matches, and the check glyph renders.
		expect(visual).toHaveAttribute("data-selected", "true");
		expect(visual.querySelector("svg")).not.toBeNull();
		box.focus();
		await user.keyboard(" ");
		expect(visual).not.toHaveAttribute("data-selected");
		expect(visual.querySelector("svg")).toBeNull();
	});

	it("mirrors indeterminate state onto the decorative box visual", async () => {
		render(<SureCheckbox isIndeterminate>All folders</SureCheckbox>);
		const box = screen.getByRole("checkbox", { name: "All folders" });
		const visual = decorativeVisual(box);
		expect(visual).toHaveAttribute("data-indeterminate", "true");
		// Indeterminate renders the dash glyph, not the check.
		expect(visual.querySelector('path[d="M2 6h8"]')).not.toBeNull();
		expect(visual.querySelector('path[d="M2.5 6.2 4.8 8.5 9.5 3.5"]')).toBeNull();
	});

	it("mirrors disabled state onto the decorative box visual", async () => {
		render(
			<SureCheckbox isDisabled defaultSelected>
				Archived
			</SureCheckbox>,
		);
		const box = screen.getByRole("checkbox", { name: "Archived" });
		expect(decorativeVisual(box)).toHaveAttribute("data-disabled", "true");
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

	it("mirrors selection state onto the track and thumb visuals", async () => {
		const user = userEvent.setup();
		renderInMain(<SureSwitch>Dark mode</SureSwitch>);
		const toggle = screen.getByRole("switch", { name: "Dark mode" });
		const track = decorativeVisual(toggle);
		const thumb = track.querySelector(":scope > span[aria-hidden='true']");
		if (!(thumb instanceof HTMLElement)) {
			throw new Error("Expected a thumb span inside the switch track.");
		}
		expect(track).not.toHaveAttribute("data-selected");
		expect(thumb).not.toHaveAttribute("data-selected");
		toggle.focus();
		await user.keyboard(" ");
		expect(toggle).toBeChecked();
		expect(track).toHaveAttribute("data-selected", "true");
		expect(thumb).toHaveAttribute("data-selected", "true");
		await user.keyboard(" ");
		expect(toggle).not.toBeChecked();
		expect(track).not.toHaveAttribute("data-selected");
		expect(thumb).not.toHaveAttribute("data-selected");
	});

	it("mirrors disabled state onto the track visual", async () => {
		renderInMain(<SureSwitch isDisabled>Dark mode</SureSwitch>);
		const toggle = screen.getByRole("switch", { name: "Dark mode" });
		expect(decorativeVisual(toggle)).toHaveAttribute("data-disabled", "true");
	});
});
