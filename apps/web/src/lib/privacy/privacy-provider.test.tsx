// Privacy provider tests (t_alt_fnd_011).
//
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "~/components/ui/a11y-assert";
import {
	SURE_PRIVACY_MASKED_VALUE,
	SURE_PRIVACY_STORAGE_KEY,
} from "~/lib/preferences/presentation";
import { PrivacyProvider, usePrivacy } from "./privacy-provider";
import { formatMessage } from "~/lib/i18n/messages";

function Probe(): React.ReactElement {
	const { masked, toggleMasked } = usePrivacy();
	return (
		<>
			<p data-testid="probe">{masked ? "masked" : "exposed"}</p>
			<button type="button" onClick={toggleMasked}>
				toggle
			</button>
		</>
	);
}

describe("PrivacyProvider", () => {
	it("defaults unmasked and persists the toggle as a presentation pref", async () => {
		localStorage.clear();
		const user = userEvent.setup();
		renderInMain(
			<PrivacyProvider>
				<Probe />
			</PrivacyProvider>,
		);
		expect(screen.getByTestId("probe")).toHaveTextContent("exposed");
		await user.click(screen.getByRole("button", { name: "toggle" }));
		expect(screen.getByTestId("probe")).toHaveTextContent("masked");
		expect(localStorage.getItem(SURE_PRIVACY_STORAGE_KEY)).toBe(SURE_PRIVACY_MASKED_VALUE);
		await expectNoAxeViolations();
		localStorage.clear();
	});

	it("fails closed during SSR, then keeps a stored mask after hydration", async () => {
		localStorage.clear();
		localStorage.setItem(SURE_PRIVACY_STORAGE_KEY, SURE_PRIVACY_MASKED_VALUE);
		try {
			// Server markup cannot read storage and therefore fails closed.
			const ssr = renderToString(
				<PrivacyProvider>
					<Probe />
				</PrivacyProvider>,
			);
			expect(ssr).toContain("masked");
			expect(ssr).not.toContain("exposed");
			// Client resolves the stored flag in the hydration effect
			// (RTL flushes effects, so assert the resolved state here).
			render(
				<main>
					<PrivacyProvider>
						<Probe />
					</PrivacyProvider>
				</main>,
			);
			await waitFor(() => {
				expect(screen.getByTestId("probe")).toHaveTextContent("masked");
			});
		} finally {
			localStorage.clear();
		}
	});

	it("fails closed during SSR even when no preference exists", () => {
		localStorage.clear();
		const ssr = renderToString(
			<PrivacyProvider>
				<Probe />
			</PrivacyProvider>,
		);
		expect(ssr).toContain("masked");
		expect(ssr).not.toContain("exposed");
	});

	it("masks only the flag — never the message catalog", () => {
		expect(formatMessage("privacy.maskedBalance")).toBe("Hidden balance");
	});
});
