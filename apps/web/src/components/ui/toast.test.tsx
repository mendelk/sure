// SureToast tests: queueing, action, dismiss, live-region semantics.
//
// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations, renderInMain } from "./a11y-assert";
import { SureButton } from "./button";
import { SureToastProvider, useSureToast } from "./toast";

function ShowToastButton(): React.ReactElement {
	const { toast } = useSureToast();
	return (
		<SureButton
			onPress={() => {
				toast("Report exported.", { title: "Done", tone: "success" });
			}}
		>
			Export
		</SureButton>
	);
}

function ActionButton({ onAction }: { onAction: () => void }): React.ReactElement {
	const { toast } = useSureToast();
	return (
		<SureButton
			onPress={() => {
				toast("Message deleted.", { actionLabel: "Undo", onAction });
			}}
		>
			Delete
		</SureButton>
	);
}

function FailButton(): React.ReactElement {
	const { toast } = useSureToast();
	return (
		<SureButton
			onPress={() => {
				toast("Sync failed.", { tone: "destructive", duration: 0 });
			}}
		>
			Sync
		</SureButton>
	);
}

describe("SureToast", () => {
	it("announces queued toasts and dismisses them on request", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureToastProvider>
				<ShowToastButton />
			</SureToastProvider>,
		);
		expect(screen.queryByRole("status")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Export" }));
		const toast = await screen.findByRole("status");
		expect(toast).toHaveTextContent("Report exported.");
		expect(toast).toHaveTextContent("Done");
		await expectNoAxeViolations();
		await user.click(screen.getByRole("button", { name: /Dismiss notification/ }));
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("runs the toast action before dismissing", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn<() => void>();
		renderInMain(
			<SureToastProvider>
				<ActionButton onAction={onAction} />
			</SureToastProvider>,
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await screen.findByRole("status");
		await user.click(screen.getByRole("button", { name: "Undo" }));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("asserts destructive toasts as alerts", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureToastProvider>
				<FailButton />
			</SureToastProvider>,
		);
		await user.click(screen.getByRole("button", { name: "Sync" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Sync failed.");
	});
});
