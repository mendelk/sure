// SureToast (apps/web).
//
// Toast notifications: a live-region queue with auto-dismiss, per-toast
// dismiss buttons, and optional actions. Destructive toasts assert
// (role="alert"); others use role="status". Wrap the app (or story) once
// in SureToastProvider, then call `toast()` from the context.
import * as stylex from "@stylexjs/stylex";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type * as React from "react";
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

let nextToastId = 1;

export function SureToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const [toasts, setToasts] = useState<readonly SureToast[]>([]);
	const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

	const dismiss = useCallback((id: number) => {
		const timer = timers.current.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	const toast = useCallback(
		(message: string, options?: SureToastOptions): number => {
			const id = nextToastId;
			nextToastId += 1;
			const duration = options?.duration ?? 5000;
			setToasts((current) => [
				...current,
				{
					id,
					message,
					title: options?.title ?? "",
					tone: options?.tone ?? "neutral",
					duration,
					actionLabel: options?.actionLabel ?? "",
					onAction: options?.onAction ?? null,
				},
			]);
			if (duration > 0) {
				const timer = setTimeout(() => {
					dismiss(id);
				}, duration);
				timers.current.set(id, timer);
			}
			return id;
		},
		[dismiss],
	);

	useEffect(
		() => () => {
			for (const timer of timers.current.values()) {
				clearTimeout(timer);
			}
			timers.current.clear();
		},
		[],
	);

	const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<SureToastRegion toasts={toasts} onDismiss={dismiss} />
		</ToastContext.Provider>
	);
}

function SureToastRegion({
	toasts,
	onDismiss,
}: {
	toasts: readonly SureToast[];
	onDismiss: (id: number) => void;
}): React.ReactElement | null {
	if (toasts.length === 0) {
		return null;
	}
	return (
		<div aria-label="Notifications" {...stylex.props(toastStyles.region, sureMotion.allowOnly)}>
			{toasts.map((item) => (
				<div
					key={item.id}
					role={item.tone === "destructive" ? "alert" : "status"}
					{...stylex.props(sureFont.base, toastStyles.card)}
				>
					<span aria-hidden="true" {...stylex.props(toastStyles.accent, ACCENT[item.tone])} />
					<div {...stylex.props(toastStyles.text)}>
						{item.title !== "" ? (
							<div {...stylex.props(toastStyles.title)}>{item.title}</div>
						) : null}
						<div>{item.message}</div>
					</div>
					<div {...stylex.props(toastStyles.actions)}>
						{item.actionLabel !== "" && item.onAction !== null ? (
							<button
								type="button"
								onClick={() => {
									item.onAction?.();
									onDismiss(item.id);
								}}
								{...stylex.props(sureFont.base, toastStyles.miniButton, sureFocus.ring)}
							>
								{item.actionLabel}
							</button>
						) : null}
						<button
							type="button"
							aria-label={`Dismiss notification: ${item.title !== "" ? item.title : item.message}`}
							onClick={() => {
								onDismiss(item.id);
							}}
							{...stylex.props(toastStyles.iconButton, sureFocus.ring)}
						>
							<span aria-hidden="true">×</span>
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
