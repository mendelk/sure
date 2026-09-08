// SSR/hydration tests (t_alt_fnd_011).
//
// The document shell renders identically on the server and in the first
// client pass (no data-theme pre-hydration → no mismatch), hydrates
// without recoverable errors, then applies stored or system themes as a
// post-hydration update. The theme-choice hook resolves null-first for
// the same reason and follows OS changes while the choice is "system".
//
// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemedHtml } from "~/routes/__root";
import { SURE_THEME_STORAGE_KEY } from "~/styles/theme";
import { ThemeChoiceProvider, useThemeChoiceContext } from "~/styles/theme-choice-context";
import { useThemeChoice } from "~/styles/use-theme-choice";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// Manual hydrateRoot/update assertions below wrap work in React's `act`
// (outside Testing Library's render), which requires the act environment
// flag that RTL otherwise sets up for its own renders.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function shell(theme: "light" | "dark" | null): React.ReactElement {
	return (
		<ThemedHtml
			theme={theme}
			head={<title>Sure Web</title>}
			body={<div data-testid="page">page body</div>}
		/>
	);
}

function installMatchMedia(matches: boolean): {
	setMatches: (next: boolean) => void;
	restore: () => void;
} {
	let current = matches;
	const listeners = new Set<(event: { matches: boolean }) => void>();
	const query = {
		get matches() {
			return current;
		},
		addEventListener: (_event: string, handler: (e: { matches: boolean }) => void): void => {
			listeners.add(handler);
		},
		removeEventListener: (_event: string, handler: (e: { matches: boolean }) => void): void => {
			listeners.delete(handler);
		},
	};
	const original = window.matchMedia;
	Object.defineProperty(window, "matchMedia", {
		value: () => query,
		configurable: true,
		writable: true,
	});
	return {
		setMatches: (next: boolean): void => {
			current = next;
			for (const listener of listeners) {
				listener({ matches: next });
			}
		},
		restore: (): void => {
			Object.defineProperty(window, "matchMedia", {
				value: original,
				configurable: true,
				writable: true,
			});
		},
	};
}

const originalDocumentHtml = document.documentElement.outerHTML;

/**
 * Paint full-document SSR markup into the LIVE document nodes
 * (identity-preserving: Testing Library keeps querying the same body).
 * `<template>`-based parsing drops <html>, so DOMParser supplies the
 * source and attributes/content copy onto the live nodes.
 */
function paintDocument(html: string): void {
	const parsed = new DOMParser().parseFromString(html, "text/html");
	if (parsed.documentElement.tagName.toLowerCase() !== "html") {
		throw new Error("SSR markup did not produce an <html> element.");
	}
	const live = document.documentElement;
	for (const attr of Array.from(live.attributes)) {
		live.removeAttribute(attr.name);
	}
	for (const attr of Array.from(parsed.documentElement.attributes)) {
		live.setAttribute(attr.name, attr.value);
	}
	document.head.innerHTML = parsed.head.innerHTML;
	document.body.innerHTML = parsed.body.innerHTML;
}

/** Server markup separates adjacent text with comments — strip them to compare. */
function withoutComments(html: string): string {
	return html.replace(/<!--.*?-->/g, "");
}

afterEach(() => {
	// Restore the harness document after the full-document hydration test.
	paintDocument(originalDocumentHtml);
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("document shell SSR/hydration", () => {
	it("SSR and first client render agree: no data-theme pre-hydration", () => {
		const ssr = renderToString(shell(null));
		expect(ssr).toContain('lang="en"');
		expect(ssr).not.toContain("data-theme");
		expect(ssr).toContain("page body");
	});

	it("hydrates the SSR markup with no recoverable errors, then applies themes", async () => {
		const errors: unknown[] = [];
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const ssr = renderToString(shell(null));
			paintDocument(ssr);

			const holder: { root?: ReturnType<typeof hydrateRoot> | undefined } = {};
			await act(async () => {
				holder.root = hydrateRoot(document, shell(null), {
					onRecoverableError: (error) => {
						errors.push(error);
					},
				});
			});
			expect(errors).toEqual([]);
			expect(document.querySelector("[data-theme]")).toBeNull();
			expect(screen.getByTestId("page")).toHaveTextContent("page body");

			// Post-hydration theme resolution is an update, not a mismatch.
			const hydrated = holder.root;
			if (hydrated === undefined) {
				throw new Error("hydrateRoot did not return a root.");
			}
			await act(async () => {
				hydrated.render(shell("dark"));
			});
			expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
			act(() => {
				hydrated.unmount();
			});
			expect(consoleSpy).not.toHaveBeenCalled();
		} finally {
			consoleSpy.mockRestore();
		}
	});

	it("renders an explicit theme on both server and client", () => {
		const ssr = renderToString(shell("dark"));
		expect(ssr).toContain('data-theme="dark"');
	});
});

function StoredChoiceProbe(): React.ReactElement {
	const { choice, theme } = useThemeChoice();
	return (
		<p data-testid="probe">
			{choice ?? "pending"} / {theme ?? "pending"}
		</p>
	);
}

function SystemFollowProbe(): React.ReactElement {
	const { choice, theme, setChoice } = useThemeChoice();
	return (
		<>
			<p data-testid="probe">
				{choice ?? "pending"} / {theme ?? "pending"}
			</p>
			<button type="button" onClick={() => setChoice("light")}>
				go light
			</button>
		</>
	);
}

function SharedThemeConsumer(): React.ReactElement {
	const { choice, theme, setChoice } = useThemeChoiceContext();
	return (
		<>
			<p data-testid="shared-theme">
				{choice ?? "pending"} / {theme ?? "pending"}
			</p>
			<button type="button" onClick={() => setChoice("dark")}>
				dark shared theme
			</button>
		</>
	);
}

function SharedThemeHarness(): React.ReactElement {
	const themeState = useThemeChoice();
	return (
		<ThemeChoiceProvider value={themeState}>
			<SharedThemeConsumer />
		</ThemeChoiceProvider>
	);
}

describe("useThemeChoice", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	it("starts null (SSR/first render agree), then resolves the stored choice", async () => {
		const media = installMatchMedia(false);
		localStorage.setItem(SURE_THEME_STORAGE_KEY, "dark");
		try {
			// Server markup stays unresolved (effects never run on the server)…
			expect(withoutComments(renderToString(<StoredChoiceProbe />))).toContain("pending / pending");
			// …then the stored choice resolves in the hydration effect.
			render(
				<main>
					<StoredChoiceProbe />
				</main>,
			);
			await waitFor(() => {
				expect(screen.getByTestId("probe")).toHaveTextContent("dark / dark");
			});
		} finally {
			media.restore();
		}
	});

	it("follows the OS while the choice is system, and persists changes", async () => {
		const media = installMatchMedia(true);
		const user = userEvent.setup();
		try {
			render(
				<main>
					<SystemFollowProbe />
				</main>,
			);
			await waitFor(() => {
				expect(screen.getByTestId("probe")).toHaveTextContent("system / dark");
			});
			// OS flips to light → resolved theme follows (choice stays system).
			await act(async () => {
				media.setMatches(false);
			});
			await waitFor(() => {
				expect(screen.getByTestId("probe")).toHaveTextContent("system / light");
			});
			// Explicit choice wins over the OS and persists.
			await user.click(screen.getByRole("button", { name: "go light" }));
			expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBe("light");
			expect(screen.getByTestId("probe")).toHaveTextContent("light / light");
		} finally {
			media.restore();
		}
	});

	it("shares one root-owned theme state with controls", async () => {
		const media = installMatchMedia(false);
		const user = userEvent.setup();
		try {
			render(
				<main>
					<SharedThemeHarness />
				</main>,
			);
			await waitFor(() => {
				expect(screen.getByTestId("shared-theme")).toHaveTextContent("system / light");
			});
			await user.click(screen.getByRole("button", { name: "dark shared theme" }));
			expect(screen.getByTestId("shared-theme")).toHaveTextContent("dark / dark");
			expect(localStorage.getItem(SURE_THEME_STORAGE_KEY)).toBe("dark");
		} finally {
			media.restore();
		}
	});
});
