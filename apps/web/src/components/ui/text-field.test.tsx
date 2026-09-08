// SureTextField tests: labeling, errors, multiline, a11y.
//
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureTextField } from "./text-field";

describe("SureTextField", () => {
	it("associates label, description, and input", async () => {
		renderInMain(
			<SureTextField
				label="Email"
				type="email"
				placeholder="you@example.com"
				description="We never share your email."
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Email" });
		expect(input).toHaveAttribute("type", "email");
		expect(screen.getByText("We never share your email.")).toBeDefined();
		await expectNoAxeViolations();
	});

	it("announces validation errors as alerts", async () => {
		renderInMain(
			<SureTextField label="Email" isInvalid errorMessage="Enter a valid email address." />,
		);
		const input = screen.getByRole("textbox", { name: "Email" });
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
		await expectNoAxeViolations();
	});

	it("supports multiline input and typing", async () => {
		const user = userEvent.setup();
		renderInMain(<SureTextField label="Notes" multiline />);
		const area = screen.getByRole("textbox", { name: "Notes" });
		expect(area.tagName).toBe("TEXTAREA");
		await user.type(area, "hello");
		expect(area).toHaveValue("hello");
	});
});
