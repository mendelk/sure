// Shared axe assertion for Sure UI primitive tests (apps/web, vitest only).
//
// Runs axe-core against the rendered document and fails on violations.
// Incomplete (needs-review) results are ignored: jsdom has no layout, so
// rules like color-contrast cannot complete there — Storybook's a11y addon
// covers those in a real browser. Product code never imports this module.
import { render } from "@testing-library/react";
import { createElement } from "react";
import type * as React from "react";
import { expect } from "vitest";
import { axe } from "vitest-axe";

export async function expectNoAxeViolations(): Promise<void> {
	const results = await axe(document.body);
	const summary = results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		targets: violation.nodes.map((node) => node.target),
	}));
	expect(summary).toEqual([]);
}

/**
 * Render inside a `<main>` landmark: the axe `region` rule requires page
 * content to live in landmarks, and bare test renders have none. Overlays
 * (dialogs, menus, toasts) portal outside — axe exempts modal dialogs;
 * suites asserting on open popovers/menus/toasts keep the trigger in `<main>`.
 */
export function renderInMain(ui: React.ReactElement): void {
	render(createElement("main", null, ui));
}
