// SureButton + SureLink tests: variants, disabled/loading, a11y.
//
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureButton, SureLink } from "./button";

describe("SureButton", () => {
	it("renders variants without axe violations", async () => {
		renderInMain(
			<>
				<SureButton variant="primary">Primary</SureButton>
				<SureButton variant="secondary">Secondary</SureButton>
				<SureButton variant="secondary-strong">Strong</SureButton>
				<SureButton variant="destructive">Delete</SureButton>
				<SureButton variant="ghost">Ghost</SureButton>
				<SureButton variant="outline">Outline</SureButton>
			</>,
		);
		expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
		await expectNoAxeViolations();
	});

	it("fires onPress on click and keyboard", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn<(e: unknown) => void>();
		render(<SureButton onPress={onPress}>Save</SureButton>);
		const button = screen.getByRole("button", { name: "Save" });
		await user.click(button);
		expect(onPress).toHaveBeenCalledTimes(1);
		button.focus();
		await user.keyboard("{Enter}");
		expect(onPress).toHaveBeenCalledTimes(2);
	});

	it("disables interaction when disabled or pending", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn<(e: unknown) => void>();
		renderInMain(
			<>
				<SureButton isDisabled onPress={onPress}>
					Disabled
				</SureButton>
				<SureButton isPending onPress={onPress}>
					Saving
				</SureButton>
			</>,
		);
		expect(screen.getByRole("button", { name: "Disabled" })).toHaveProperty("disabled", true);
		const pending = screen.getByRole("button", { name: /Saving/ });
		expect(pending).toHaveAttribute("aria-disabled", "true");
		expect(pending).toHaveAttribute("data-pending", "true");
		await user.click(pending);
		expect(onPress).not.toHaveBeenCalled();
		await expectNoAxeViolations();
	});
});

describe("SureLink", () => {
	it("renders an accessible link without axe violations", async () => {
		renderInMain(<SureLink href="https://example.com">Docs</SureLink>);
		expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
			"href",
			"https://example.com",
		);
		await expectNoAxeViolations();
	});
});
