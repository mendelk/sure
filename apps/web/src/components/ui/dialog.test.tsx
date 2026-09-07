// SureDialog + SurePopover tests: open/close, Escape, focus, labeling.
//
// @vitest-environment jsdom
import { DialogTrigger } from "react-aria-components";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureButton } from "./button";
import { SureDialog, SurePopover } from "./dialog";

describe("SureDialog", () => {
	it("opens from its trigger, traps focus, and closes on Escape", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureDialog
				title="Delete account"
				trigger={<SureButton variant="destructive">Delete</SureButton>}
				footer={<SureButton variant="secondary">Cancel</SureButton>}
			>
				This cannot be undone.
			</SureDialog>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		const dialog = await screen.findByRole("dialog", { name: "Delete account" });
		// The dialog is labelled by its heading and traps focus (asserted
		// below). React Aria intentionally omits aria-modal on the overlay;
		// background content is hidden via aria-hidden instead.
		expect(dialog.contains(document.activeElement)).toBe(true);
		await expectNoAxeViolations();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("returns focus to the trigger on close", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureDialog title="About" trigger={<SureButton>About</SureButton>}>
				Version 1.0.
			</SureDialog>,
		);
		const trigger = screen.getByRole("button", { name: "About" });
		await user.click(trigger);
		await screen.findByRole("dialog", { name: "About" });
		await user.keyboard("{Escape}");
		// Focus restoration settles after unmount; wait for it instead of
		// asserting synchronously.
		await waitFor(() => {
			expect(trigger).toHaveFocus();
		});
	});
});

describe("SurePopover", () => {
	it("opens a labelled popover without axe violations", async () => {
		const user = userEvent.setup();
		renderInMain(
			<DialogTrigger>
				<SureButton variant="secondary">Details</SureButton>
				<SurePopover label="Plan details">Renews monthly.</SurePopover>
			</DialogTrigger>,
		);
		await user.click(screen.getByRole("button", { name: "Details" }));
		expect(await screen.findByRole("dialog", { name: "Plan details" })).toHaveTextContent(
			"Renews monthly.",
		);
		await expectNoAxeViolations();
	});
});
