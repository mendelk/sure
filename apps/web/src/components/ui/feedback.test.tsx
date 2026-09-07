// SureAlert, SureBadge, SureCard, SureSkeleton, SureEmptyState tests.
//
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureAlert, SureBadge } from "./alert";
import { SureButton } from "./button";
import {
	SureCard,
	SureCardContent,
	SureCardDescription,
	SureCardFooter,
	SureCardHeader,
	SureCardTitle,
	SureEmptyState,
	SureSkeleton,
} from "./card";

describe("SureAlert", () => {
	it("asserts destructive alerts and reports other tones as status", async () => {
		renderInMain(
			<>
				<SureAlert tone="destructive" title="Failed">
					Could not save.
				</SureAlert>
				<SureAlert tone="success" title="Saved">
					All changes stored.
				</SureAlert>
			</>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
		expect(screen.getByRole("status")).toHaveTextContent("All changes stored.");
		await expectNoAxeViolations();
	});
});

describe("SureBadge", () => {
	it("renders tones without axe violations", async () => {
		renderInMain(
			<>
				<SureBadge tone="neutral">Draft</SureBadge>
				<SureBadge tone="info">Synced</SureBadge>
				<SureBadge tone="success">Paid</SureBadge>
				<SureBadge tone="warning">Due soon</SureBadge>
				<SureBadge tone="destructive">Overdue</SureBadge>
			</>,
		);
		expect(screen.getByText("Overdue")).toBeDefined();
		await expectNoAxeViolations();
	});
});

describe("SureCard", () => {
	it("composes header, content, and footer landmarks", async () => {
		renderInMain(
			<SureCard>
				<SureCardHeader>
					<SureCardTitle>Balance</SureCardTitle>
					<SureCardDescription>Across all accounts</SureCardDescription>
				</SureCardHeader>
				<SureCardContent>12 400 €</SureCardContent>
				<SureCardFooter>
					<SureButton variant="secondary">Details</SureButton>
				</SureCardFooter>
			</SureCard>,
		);
		expect(screen.getByRole("article")).toBeDefined();
		expect(screen.getByRole("heading", { name: "Balance" })).toBeDefined();
		await expectNoAxeViolations();
	});
});

describe("SureSkeleton", () => {
	it("marks the region busy with an accessible label", async () => {
		renderInMain(<SureSkeleton label="Loading transactions" lines={2} />);
		const region = screen.getByRole("status", { name: "Loading transactions" });
		expect(region).toHaveAttribute("aria-busy", "true");
		await expectNoAxeViolations();
	});
});

describe("SureEmptyState", () => {
	it("labels the section and exposes its action", async () => {
		renderInMain(
			<SureEmptyState
				title="No transactions yet"
				description="Import a CSV to get started."
				action={<SureButton variant="secondary">Import</SureButton>}
			/>,
		);
		expect(screen.getByRole("region", { name: "No transactions yet" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Import" })).toBeDefined();
		await expectNoAxeViolations();
	});
});
