// SureMenu tests: open, arrow navigation, action dispatch, a11y.
//
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureButton } from "./button";
import { SureMenu } from "./menu";
import type { SureMenuItem } from "./menu";

const ITEMS: readonly SureMenuItem[] = [
	{ id: "edit", label: "Edit" },
	{ id: "duplicate", label: "Duplicate" },
	{ id: "archive", label: "Archive", isDisabled: true },
	{ id: "delete", label: "Delete", isDestructive: true },
];

describe("SureMenu", () => {
	it("opens, navigates with arrows, and dispatches the chosen action", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn<(key: unknown, item: unknown) => void>();
		renderInMain(
			<SureMenu
				trigger={<SureButton variant="secondary">Actions</SureButton>}
				items={ITEMS}
				onAction={onAction}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Actions" }));
		// The menu takes its accessible name from the trigger.
		const menu = await screen.findByRole("menu", { name: "Actions" });
		expect(menu).toBeDefined();
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		// React Aria dispatches (key, item); the key is the contract.
		expect(onAction).toHaveBeenCalledWith("duplicate", expect.anything());
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("skips disabled items and has no axe violations while open", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureMenu trigger={<SureButton variant="secondary">Actions</SureButton>} items={ITEMS} />,
		);
		await user.click(screen.getByRole("button", { name: "Actions" }));
		const menu = await screen.findByRole("menu");
		expect(menu).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await expectNoAxeViolations();
	});
});
