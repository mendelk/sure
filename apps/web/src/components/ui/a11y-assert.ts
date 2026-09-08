// Shared axe assertion for Sure UI primitive tests (apps/web, vitest only).
//
// Runs axe-core against the rendered document and fails on violations.
// The `color-contrast` rule is disabled here, not waived: jsdom has no
// layout, so the rule cannot complete (axe needs canvas measurement) and
// every run prints "Not implemented: HTMLCanvasElement's getContext()"
// noise. Contrast is covered instead by the automated browser Storybook
// check (`pnpm --filter @sure/web test:browser`), which runs the full
// rule set in real Chromium. Do not claim contrast coverage from jsdom
// suites. Product code never imports this module.
import { render } from "@testing-library/react";
import { createElement } from "react";
import type * as React from "react";
import { expect } from "vitest";
import { axe } from "vitest-axe";

export async function expectNoAxeViolations(): Promise<void> {
	const results = await axe(document.body, {
		rules: {
			"color-contrast": { enabled: false },
		},
	});
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
