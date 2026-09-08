// SensitiveAmount tests (t_alt_fnd_011).
//
// Balances, chart-adjacent values, tooltips, accessible names, copied
// text, and previews mask together when privacy is on — without mutating
// source data. The accessibility tree never exposes the real amount
// while masked.
//
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { LocaleProvider } from "~/lib/i18n/i18n-provider";
import { PRIVACY_MASK } from "~/lib/privacy/masking";
import { PrivacyProvider } from "~/lib/privacy/privacy-provider";
import {
	SURE_LOCALE_STORAGE_KEY,
	SURE_PRIVACY_MASKED_VALUE,
	SURE_PRIVACY_STORAGE_KEY,
} from "~/lib/preferences/presentation";
import { SensitiveAmount } from "./sensitive-amount";

function Shelled(ui: React.ReactElement): React.ReactElement {
	return (
		<LocaleProvider>
			<PrivacyProvider>{ui}</PrivacyProvider>
		</LocaleProvider>
	);
}

describe("SensitiveAmount", () => {
	it("exposes the locale-formatted amount when unmasked", async () => {
		localStorage.clear();
		renderInMain(Shelled(<SensitiveAmount amount={1234.5} currency="USD" masked={false} />));
		const region = screen.getByTestId("sensitive-amount");
		expect(within(region).getByText("$1,234.50")).toBeDefined();
		expect(region.textContent).toContain("$1,234.50");
		// Tooltip and accessible name carry the real value when exposed.
		expect(region.querySelector("[title]")?.getAttribute("title")).toBe("$1,234.50");
		await expectNoAxeViolations();
	});

	it("masks text, accessible name, and tooltip together (a11y tree clean)", async () => {
		localStorage.clear();
		renderInMain(Shelled(<SensitiveAmount amount={9876.54} currency="USD" masked={true} />));
		const region = screen.getByTestId("sensitive-amount");
		expect(region.textContent).not.toMatch(/\d/);
		expect(within(region).getByText(PRIVACY_MASK)).toBeDefined();
		// The accessibility tree exposes ONLY the generic message.
		const named = region.querySelector('[aria-label="Hidden balance"]');
		expect(named).not.toBeNull();
		expect(region.querySelector("[title]")?.getAttribute("title")).toBe("Hidden balance");
		expect(document.body.textContent).not.toContain("9,876");
		await expectNoAxeViolations();
	});

	it("follows the global privacy control by default", async () => {
		localStorage.clear();
		render(<main>{Shelled(<SensitiveAmount amount={50} currency="USD" />)}</main>);
		// No stored mask resolves to exposed after hydration. SSR itself is
		// covered below and always fails closed as masked.
		expect(screen.getByTestId("sensitive-amount").textContent).toContain("$50.00");
		localStorage.clear();
	});

	it("keeps the amount out of fail-closed SSR HTML and the accessibility name", () => {
		localStorage.clear();
		const ssr = renderToString(Shelled(<SensitiveAmount amount={1234.5} currency="USD" />));
		expect(ssr).toContain(PRIVACY_MASK);
		expect(ssr).toContain("Hidden balance");
		expect(ssr).not.toContain("1,234");
		expect(ssr).not.toContain("1234");
	});

	it("writes masked text to the clipboard on copy when masked", async () => {
		localStorage.clear();
		renderInMain(Shelled(<SensitiveAmount amount={1234.5} currency="USD" masked={true} />));
		const text = screen.getByText(PRIVACY_MASK);
		const written: Record<string, string> = {};
		fireEvent.copy(text, {
			clipboardData: {
				setData: (kind: string, value: string) => {
					written[kind] = value;
				},
			},
		});
		expect(written["text/plain"]).toBe(PRIVACY_MASK);
		expect(written["text/plain"]).not.toMatch(/\d/);
	});

	it("copies a fixed mask for Arabic-formatted currency", async () => {
		localStorage.clear();
		localStorage.setItem(SURE_LOCALE_STORAGE_KEY, "ar-EG");
		try {
			renderInMain(Shelled(<SensitiveAmount amount={1234.5} currency="USD" masked={true} />));
			const text = screen.getByText(PRIVACY_MASK);
			const written: Record<string, string> = {};
			fireEvent.copy(text, {
				clipboardData: {
					setData: (kind: string, value: string) => {
						written[kind] = value;
					},
				},
			});
			expect(written["text/plain"]).toBe(PRIVACY_MASK);
			expect(written["text/plain"]).not.toMatch(/[١٢٣٤٥٦٧٨٩٠]/);
		} finally {
			localStorage.clear();
		}
	});

	it("passes copies through untouched when unmasked", async () => {
		localStorage.clear();
		renderInMain(Shelled(<SensitiveAmount amount={1234.5} currency="USD" masked={false} />));
		const text = screen.getByText("$1,234.50");
		let prevented = false;
		const event = new Event("copy", { bubbles: true, cancelable: true });
		event.preventDefault = () => {
			prevented = true;
		};
		text.dispatchEvent(event);
		expect(prevented).toBe(false);
	});

	it("marks the region sensitive without persisting the amount", () => {
		localStorage.clear();
		renderInMain(Shelled(<SensitiveAmount amount={42} currency="USD" masked={true} />));
		const region = screen.getByTestId("sensitive-amount");
		expect(region).toHaveAttribute("data-sensitive", "true");
		expect(region).toHaveAttribute("data-privacy-masked", "true");
		expect(localStorage.getItem(SURE_PRIVACY_STORAGE_KEY)).toBeNull();
		expect(SURE_PRIVACY_MASKED_VALUE).toBe("1");
	});
});
