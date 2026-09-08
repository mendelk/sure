// SureToast (apps/web).
//
// Toast notifications on React Aria behavior: a `ToastQueue` owns ordering
// and auto-dismiss timers (pausing on hover/focus), `ToastRegion` renders
// the labelled live region, and each `Toast` manages focus, NVDA
// announcement (role="alert" content), and exit. Sure styling, tones, and
// the `toast()`/`dismiss()` context API wrap those primitives — feature
// code keeps calling `useSureToast()` and never touches the queue.
//
// Semantics note: React Aria announces every toast assertively (alert
// content inside an alertdialog). `tone` therefore drives accent styling
// only — there is no polite/status variant anymore.
import * as stylex from "@stylexjs/stylex";
import {
	Button as AriaButton,
	Text as AriaText,
	UNSTABLE_Toast as AriaToast,
	UNSTABLE_ToastContent as AriaToastContent,
	UNSTABLE_ToastQueue as SureToastQueue,
	UNSTABLE_ToastRegion as AriaToastRegion,
} from "react-aria-components";
import type { QueuedToast } from "react-aria-components";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFocus, sureFont, sureMotion, type SureStyle } from "./sure-styles";

export type SureToastTone = "info" | "success" | "warning" | "destructive" | "neutral";

export interface SureToastOptions {
	title?: string;
	tone?: SureToastTone;
	/** Auto-dismiss delay in ms. Defaults to 5000; 0 disables. */
	duration?: number;
	/** Optional action label + handler rendered as a button. */
	actionLabel?: string;
	onAction?: () => void;
}

export interface SureToast extends Required<Omit<SureToastOptions, "onAction">> {
	id: number;
	message: string;
	onAction: (() => void) | null;
}

/** Queue content for one toast — everything the region needs to render. */
interface SureToastContent {
	title: string;
	message: string;
	tone: SureToastTone;
	actionLabel: string;
	onAction: (() => void) | null;
}

interface SureToastContextValue {
	toast: (message: string, options?: SureToastOptions) => number;
	dismiss: (id: number) => void;
}

const ToastContext = createContext<SureToastContextValue | null>(null);

export function useSureToast(): SureToastContextValue {
	const value = useContext(ToastContext);
	if (value === null) {
		throw new Error("useSureToast must be used inside <SureToastProvider>.");
	}
	return value;
}

const sureToastIn = stylex.keyframes({
	from: { opacity: 0, transform: "translateY(8px)" },
	to: { opacity: 1, transform: "translateY(0)" },
});

const toastStyles = stylex.create({
	region: {
		position: "fixed",
		bottom: 16,
		right: 16,
		left: 16,
		zIndex: 60,
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		gap: 8,
		pointerEvents: "none",
		"@media (min-width: 640px)": {
			left: "auto",
			width: 360,
		},
	},
	card: {
		display: "flex",
		alignItems: "flex-start",
		gap: 10,
		paddingBlock: 12,
		paddingInline: 14,
		pointerEvents: "auto",
		backgroundColor: vars.bgInverse,
		color: vars.textInverse,
		borderRadius: vars.radiusMd,
		boxShadow: vars.shadowBorderMd,
		"@media (prefers-reduced-motion: no-preference)": {
			animationName: sureToastIn,
			animationDuration: "200ms",
			animationTimingFunction: "ease-out",
		},
	},
	// The React Aria content wrapper (role="alert") must not disturb the
	// card flex layout — its children participate directly.
	content: {
		display: "contents",
	},
	accent: {
		flexShrink: 0,
		width: 4,
		alignSelf: "stretch",
		borderRadius: 2,
		backgroundColor: vars.textSubdued,
	},
	accentInfo: { backgroundColor: vars.info },
	accentSuccess: { backgroundColor: vars.success },
	accentWarning: { backgroundColor: vars.warning },
	accentDestructive: { backgroundColor: vars.destructive },
	accentNeutral: { backgroundColor: vars.textSubdued },
	text: {
		flexGrow: 1,
		minWidth: 0,
		fontSize: 14,
	},
	title: {
		fontWeight: vars.fontWeightSemibold,
		marginBottom: 2,
	},
	actions: {
		display: "flex",
		alignItems: "center",
		gap: 4,
		flexShrink: 0,
	},
	miniButton: {
		paddingBlock: 4,
		paddingInline: 8,
		fontSize: 13,
		fontWeight: vars.fontWeightMedium,
		color: "inherit",
		backgroundColor: "transparent",
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: "currentColor",
		borderRadius: 6,
		cursor: "pointer",
	},
	iconButton: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 28,
		height: 28,
		padding: 0,
		color: "inherit",
		backgroundColor: "transparent",
		borderStyle: "none",
		borderWidth: 0,
		borderRadius: 6,
		cursor: "pointer",
		fontSize: 16,
		lineHeight: 1,
	},
});

const ACCENT: Record<SureToastTone, SureStyle> = {
	info: toastStyles.accentInfo,
	success: toastStyles.accentSuccess,
	warning: toastStyles.accentWarning,
	destructive: toastStyles.accentDestructive,
	neutral: toastStyles.accentNeutral,
};

export function SureToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	// One queue per provider: ordering, auto-dismiss timers (with
	// hover/focus pausing), and announcements are React Aria's job. The
	// numeric Sure ids map onto queue keys so the context API is unchanged.
	const [queue] = useState(() => new SureToastQueue<SureToastContent>());
	const keys = useRef(new Map<number, string>());
	const nextId = useRef(1);

	const dismiss = useCallback(
		(id: number) => {
			const key = keys.current.get(id);
			if (key === undefined) {
				return;
			}
			keys.current.delete(id);
			queue.close(key);
		},
		[queue],
	);

	const toast = useCallback(
		(message: string, options?: SureToastOptions): number => {
			const id = nextId.current;
			nextId.current += 1;
			const duration = options?.duration ?? 5000;
			const content: SureToastContent = {
				title: options?.title ?? "",
				message,
				tone: options?.tone ?? "neutral",
				actionLabel: options?.actionLabel ?? "",
				onAction: options?.onAction ?? null,
			};
			const key = queue.add(content, {
				...(duration > 0 ? { timeout: duration } : {}),
				onClose: () => {
					keys.current.delete(id);
				},
			});
			keys.current.set(id, key);
			return id;
		},
		[queue],
	);

	const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<SureToastRegion queue={queue} idKeys={keys} onDismiss={dismiss} />
		</ToastContext.Provider>
	);
}

function SureToastRegion({
	queue,
	idKeys,
	onDismiss,
}: {
	queue: SureToastQueue<SureToastContent>;
	idKeys: React.RefObject<Map<number, string>>;
	onDismiss: (id: number) => void;
}): React.ReactElement {
	return (
		<AriaToastRegion
			queue={queue}
			aria-label={formatMessage("ui.notifications")}
			className={stylex.props(toastStyles.region, sureMotion.allowOnly).className ?? ""}
		>
			{({ toast: item }: { toast: QueuedToast<SureToastContent> }) => (
				<SureToastCard key={item.key} item={item} idKeys={idKeys} onDismiss={onDismiss} />
			)}
		</AriaToastRegion>
	);
}

/** Resolve a queue key back to its numeric Sure id (for action handling). */
function idForKey(idKeys: React.RefObject<Map<number, string>>, key: string): number | null {
	for (const [id, candidate] of idKeys.current) {
		if (candidate === key) {
			return id;
		}
	}
	return null;
}

function SureToastCard({
	item,
	idKeys,
	onDismiss,
}: {
	item: QueuedToast<SureToastContent>;
	idKeys: React.RefObject<Map<number, string>>;
	onDismiss: (id: number) => void;
}): React.ReactElement {
	const { title, message, tone, actionLabel, onAction } = item.content;
	const dismissId = idForKey(idKeys, item.key);
	const dismissLabel = formatMessage("ui.dismissNotification", {
		name: title !== "" ? title : message,
	});
	return (
		<AriaToast
			toast={item}
			className={stylex.props(sureFont.base, toastStyles.card).className ?? ""}
		>
			<AriaToastContent className={stylex.props(toastStyles.content).className ?? ""}>
				<span aria-hidden="true" {...stylex.props(toastStyles.accent, ACCENT[tone])} />
				<div {...stylex.props(toastStyles.text)}>
					{title !== "" ? (
						<AriaText slot="title" {...stylex.props(toastStyles.title)}>
							{title}
						</AriaText>
					) : null}
					<AriaText slot="description">{message}</AriaText>
				</div>
				<div {...stylex.props(toastStyles.actions)}>
					{actionLabel !== "" && onAction !== null ? (
						<AriaButton
							onPress={() => {
								onAction();
								if (dismissId !== null) {
									onDismiss(dismissId);
								}
							}}
							className={
								stylex.props(sureFont.base, toastStyles.miniButton, sureFocus.ring).className ?? ""
							}
						>
							{actionLabel}
						</AriaButton>
					) : null}
					<AriaButton
						slot="close"
						aria-label={dismissLabel}
						onPress={() => {
							if (dismissId !== null) {
								onDismiss(dismissId);
							}
						}}
						className={stylex.props(toastStyles.iconButton, sureFocus.ring).className ?? ""}
					>
						<span aria-hidden="true">×</span>
					</AriaButton>
				</div>
			</AriaToastContent>
		</AriaToast>
	);
}
