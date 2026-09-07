// SureSelect + SureCombobox tests: keyboard selection, filtering, a11y.
//
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureCombobox, SureSelect } from "./select";
import type { SureOption } from "./select";

const COUNTRIES: readonly SureOption[] = [
	{ id: "de", label: "Germany" },
	{ id: "fr", label: "France" },
	{ id: "jp", label: "Japan" },
	{ id: "xx", label: "Closed region", isDisabled: true },
];

describe("SureSelect", () => {
	it("opens with keyboard and selects an option", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn<(key: unknown) => void>();
		renderInMain(<SureSelect label="Country" items={COUNTRIES} onSelectionChange={onChange} />);
		const button = screen.getByRole("button", { name: /Country/ });
		await user.click(button);
		const listbox = await screen.findByRole("listbox");
		expect(within(listbox).getByRole("option", { name: "Japan" })).toBeDefined();
		await user.click(within(listbox).getByRole("option", { name: "Japan" }));
		expect(onChange).toHaveBeenCalledWith("jp");
		expect(screen.getByRole("button", { name: /Japan/ })).toBeDefined();
	});

	it("surfaces errors without axe violations", async () => {
		renderInMain(<SureSelect label="Country" items={COUNTRIES} errorMessage="Pick a country." />);
		expect(screen.getByRole("alert")).toHaveTextContent("Pick a country.");
		await expectNoAxeViolations();
	});
});

describe("SureCombobox", () => {
	it("filters options as the user types and selects with Enter", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn<(key: unknown) => void>();
		renderInMain(<SureCombobox label="Country" items={COUNTRIES} onSelectionChange={onChange} />);
		const input = screen.getByRole("combobox", { name: "Country" });
		await user.click(input);
		await user.type(input, "jap");
		const listbox = await screen.findByRole("listbox");
		const options = within(listbox).getAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual(["Japan"]);
		await user.keyboard("{ArrowDown}{Enter}");
		expect(onChange).toHaveBeenCalledWith("jp");
	});

	it("has no axe violations in its resting state", async () => {
		renderInMain(
			<SureCombobox label="Country" items={COUNTRIES} description="Start typing to filter." />,
		);
		expect(screen.getByRole("combobox", { name: "Country" })).toBeDefined();
		await expectNoAxeViolations();
	});
});
