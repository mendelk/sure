// Locale provider tests (t_alt_fnd_011).
//
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import { LocaleProvider, useLocale } from "./i18n-provider";
import { SURE_LOCALE_STORAGE_KEY } from "~/lib/preferences/presentation";

function Probe(): React.ReactElement {
	const { locale, t, formatMoney } = useLocale();
	return (
		<p data-testid="probe">
			{t("shell.brand")} | {locale} | {formatMoney(1234.5, "USD")}
		</p>
	);
}

/** Server markup separates adjacent text with comments — strip them to compare. */
function withoutComments(html: string): string {
	return html.replace(/<!--.*?-->/g, "");
}

describe("LocaleProvider", () => {
	it("renders English by default and formats money for the locale", async () => {
		localStorage.clear();
		renderInMain(
			<LocaleProvider>
				<Probe />
			</LocaleProvider>,
		);
		await waitFor(() => {
			expect(screen.getByTestId("probe").textContent).toContain("Sure Web");
		});
		expect(screen.getByTestId("probe").textContent).toContain("en");
		expect(screen.getByTestId("probe").textContent).toContain("$1,234.50");
		await expectNoAxeViolations();
	});

	it("resolves a stored locale post-hydration (SSR renders the default)", async () => {
		localStorage.clear();
		localStorage.setItem(SURE_LOCALE_STORAGE_KEY, "de-DE");
		try {
			// Server markup always uses the default locale (no browser read).
			const ssr = renderToString(
				<LocaleProvider>
					<Probe />
				</LocaleProvider>,
			);
			expect(withoutComments(ssr)).toContain("| en |");
			// Client resolves the stored locale in the hydration effect.
			render(
				<main>
					<LocaleProvider>
						<Probe />
					</LocaleProvider>
				</main>,
			);
			await waitFor(() => {
				expect(screen.getByTestId("probe").textContent).not.toContain("| en |");
			});
			expect(screen.getByTestId("probe").textContent).toContain("1.234,50");
		} finally {
			localStorage.clear();
		}
	});
});
