// SureToast stories: tones, actions, persistence, long messages.
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { SureButton, SureToastProvider, useSureToast } from "~/components/ui";
import type { SureToastTone } from "~/components/ui";
import { LONG_TEXT, storyLayout } from "./storybook-layout";

function ToastButtons(): React.ReactElement {
	const { toast } = useSureToast();
	const tones: readonly SureToastTone[] = ["info", "success", "warning", "destructive", "neutral"];
	return (
		<div {...stylex.props(storyLayout.row)}>
			{tones.map((tone) => (
				<SureButton
					key={tone}
					variant="secondary"
					onPress={() => {
						toast(`${tone} notification.`, { title: tone, tone });
					}}
				>
					{tone}
				</SureButton>
			))}
			<SureButton
				variant="secondary"
				onPress={() => {
					toast("Message deleted.", {
						actionLabel: "Undo",
						onAction: () => {
							// Demo action — irreversible in the story.
						},
					});
				}}
			>
				With undo
			</SureButton>
			<SureButton
				variant="secondary"
				onPress={() => {
					toast(LONG_TEXT, { title: "Long message", duration: 0 });
				}}
			>
				Persistent + long
			</SureButton>
		</div>
	);
}

const meta: Meta<typeof SureToastProvider> = {
	title: "Feedback/Toast",
	component: SureToastProvider,
	parameters: {
		docs: {
			description: {
				component:
					"Live-region queue (status; destructive → alert) with auto-dismiss, per-toast dismiss, and optional actions. Wrap the app once; call toast() from context.",
			},
		},
	},
};

export default meta;
type Story = StoryObj<typeof SureToastProvider>;

export const Interactive: Story = {
	render: () => (
		<SureToastProvider>
			<ToastButtons />
		</SureToastProvider>
	),
};
