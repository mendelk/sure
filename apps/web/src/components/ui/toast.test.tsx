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

function DismissByIdButton(): React.ReactElement {
	const { toast, dismiss } = useSureToast();
	return (
		<SureButton
			onPress={() => {
				const id = toast("Pinned note.", { duration: 0 });
				dismiss(id);
			}}
		>
			Pin
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
		// The React Aria region only renders once the queue is non-empty.
		expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Export" }));
		const region = await screen.findByRole("region", { name: "Notifications" });
		const toast = await screen.findByRole("alertdialog");
		expect(region).toContainElement(toast);
		// React Aria announces toast content assertively (role="alert").
		const announcement = screen.getByRole("alert");
		expect(announcement).toHaveTextContent("Report exported.");
		expect(announcement).toHaveTextContent("Done");
		await expectNoAxeViolations();
		await user.click(screen.getByRole("button", { name: /Dismiss notification/ }));
		expect(screen.queryByRole("alertdialog")).toBeNull();
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
		await screen.findByRole("alertdialog");
		await user.click(screen.getByRole("button", { name: "Undo" }));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("announces destructive toasts assertively", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureToastProvider>
				<FailButton />
			</SureToastProvider>,
		);
		await user.click(screen.getByRole("button", { name: "Sync" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Sync failed.");
		expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sync failed.");
	});

	it("dismisses by the id returned from toast()", async () => {
		const user = userEvent.setup();
		renderInMain(
			<SureToastProvider>
				<DismissByIdButton />
			</SureToastProvider>,
		);
		await user.click(screen.getByRole("button", { name: "Pin" }));
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
