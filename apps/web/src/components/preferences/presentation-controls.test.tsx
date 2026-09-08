// Presentation-controls tests (t_alt_fnd_011).
//
// Theme selection (light/dark/system), the global privacy toggle, and
// locale display — composed of DS primitives, persisted as
// non-sensitive presentation prefs, and clean under axe.
//
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { LocaleProvider } from "~/lib/i18n/i18n-provider";
import { PrivacyProvider } from "~/lib/privacy/privacy-provider";
import { SURE_PRIVACY_STORAGE_KEY, SURE_THEME_STORAGE_KEY } from "~/lib/preferences/presentation";
import { useThemeChoice } from "~/styles/use-theme-choice";
import { PresentationControls, PresentationSettingsCard } from "./presentation-controls";

function Shelled(ui: React.ReactElement): React.ReactElement {
	return (
		<LocaleProvider>
			<PrivacyProvider>{ui}</PrivacyProvider>
		</LocaleProvider>
	);
}

function Controlled(): React.ReactElement {
	const { choice, setChoice } = useThemeChoice();
	return <PresentationControls themeChoice={choice} onThemeChoice={setChoice} />;
}

function noopThemeChoice(): void {}

describe("PresentationControls", () => {
	it("selects light/dark/system themes and persists the choice", async () => {
		localStorage.clear();
		const user = userEvent.setup();
		renderInMain(Shelled(<Controlled />));

		const combo = screen.getByRole("button", { name: /Theme/ });
		await user.click(combo);
		const listbox = await screen.findByRole("listbox");
		expect(within(listbox).getByRole("option", { name: "System" })).toBeDefined();
		await user.click(within(listbox).getByRole("option", { name: "Dark" }));
		expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBe("dark");
		expect(screen.getByRole("button", { name: /Dark/ })).toBeDefined();
		await expectNoAxeViolations();
		localStorage.clear();
	});

	it("toggles the global privacy mask and persists only the flag", async () => {
		localStorage.clear();
		const user = userEvent.setup();
		renderInMain(Shelled(<Controlled />));
		const toggle = screen.getByRole("switch", { name: "Hide sensitive values" });
		expect(toggle).not.toBeChecked();
		await user.click(toggle);
		expect(toggle).toBeChecked();
		expect(localStorage.getItem(SURE_PRIVACY_STORAGE_KEY)).toBe("1");
		localStorage.clear();
	});

	it("settings card documents locale and future sync without sensitive data", async () => {
		localStorage.clear();
		renderInMain(
			Shelled(<PresentationSettingsCard themeChoice="system" onThemeChoice={noopThemeChoice} />),
		);
		expect(screen.getByText("Display")).toBeDefined();
		expect(screen.getByTestId("locale-state").textContent).toContain("en");
		expect(screen.getByTestId("prefs-sync-note").textContent).toContain("Stored locally only");
		await expectNoAxeViolations();
		localStorage.clear();
	});
});
