// SureAlert + SureBadge (apps/web).
//
// Feedback primitives. Alerts assert screen-reader semantics by tone
// (destructive → role="alert", everything else → role="status"); badges
// are non-assertive text. Tones map to semantic tokens only.
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFont, type SureStyle } from "./sure-styles";

export type SureTone = "info" | "success" | "warning" | "destructive" | "neutral";

const alertStyles = stylex.create({
	root: {
		display: "flex",
		gap: 10,
		paddingBlock: 12,
		paddingInline: 14,
		borderStyle: "solid",
		borderWidth: 1,
		borderRadius: vars.radiusMd,
		fontSize: 14,
	},
	info: { backgroundColor: vars.container, borderColor: vars.borderPrimary },
	success: { backgroundColor: vars.container, borderColor: vars.borderPrimary },
	warning: { backgroundColor: vars.container, borderColor: vars.borderPrimary },
	destructive: { backgroundColor: vars.container, borderColor: vars.borderDestructive },
	neutral: { backgroundColor: vars.container, borderColor: vars.borderSecondary },
	icon: {
		flexShrink: 0,
		width: 18,
		height: 18,
		marginTop: 1,
	},
	iconInfo: { color: vars.info },
	iconSuccess: { color: vars.success },
	iconWarning: { color: vars.warning },
	iconDestructive: { color: vars.destructive },
	iconNeutral: { color: vars.textSecondary },
	title: {
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
		marginBottom: 2,
	},
	body: {
		color: vars.textSecondary,
	},
});

function AlertIcon({ tone }: { tone: SureTone }): React.ReactElement {
	const iconStyle =
		tone === "info"
			? alertStyles.iconInfo
			: tone === "success"
				? alertStyles.iconSuccess
				: tone === "warning"
					? alertStyles.iconWarning
					: tone === "destructive"
						? alertStyles.iconDestructive
						: alertStyles.iconNeutral;
	const path =
		tone === "success"
			? "M3.5 9.2 7 12.7 12.5 5.5"
			: tone === "warning" || tone === "destructive"
				? "M8 4v5M8 12.6v.4"
				: "M8 7.2V12M8 4.4v.4";
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			fill="none"
			{...stylex.props(alertStyles.icon, iconStyle)}
		>
			{tone === "warning" || tone === "destructive" ? (
				<path
					d="M8 1.8 15 14H1L8 1.8Z"
					stroke="currentColor"
					strokeWidth={1.5}
					strokeLinejoin="round"
				/>
			) : (
				<circle cx={8} cy={8} r={6.4} stroke="currentColor" strokeWidth={1.5} />
			)}
			<path
				d={path}
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export interface SureAlertProps {
	tone?: SureTone;
	title?: string;
	children: React.ReactNode;
}

const ALERT_TONE: Record<SureTone, SureStyle> = {
	info: alertStyles.info,
	success: alertStyles.success,
	warning: alertStyles.warning,
	destructive: alertStyles.destructive,
	neutral: alertStyles.neutral,
};

export function SureAlert({ tone = "info", title, children }: SureAlertProps): React.ReactElement {
	return (
		<div
			role={tone === "destructive" ? "alert" : "status"}
			{...stylex.props(sureFont.base, alertStyles.root, ALERT_TONE[tone])}
		>
			<AlertIcon tone={tone} />
			<div>
				{title != null && title !== "" ? (
					<div {...stylex.props(alertStyles.title)}>{title}</div>
				) : null}
				<div {...stylex.props(alertStyles.body)}>{children}</div>
			</div>
		</div>
	);
}

const badgeStyles = stylex.create({
	root: {
		display: "inline-flex",
		alignItems: "center",
		gap: 4,
		paddingBlock: 2,
		paddingInline: 8,
		fontSize: 12,
		fontWeight: vars.fontWeightMedium,
		lineHeight: 1.5,
		borderRadius: 999,
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		maxWidth: "100%",
	},
	neutral: { backgroundColor: vars.surface, color: vars.textSecondary },
	info: {
		backgroundColor: `color-mix(in srgb, ${vars.info} 12%, transparent)`,
		color: vars.info,
	},
	success: {
		backgroundColor: `color-mix(in srgb, ${vars.success} 12%, transparent)`,
		color: vars.success,
	},
	warning: {
		backgroundColor: `color-mix(in srgb, ${vars.warning} 14%, transparent)`,
		color: vars.warning,
	},
	destructive: {
		backgroundColor: vars.destructiveSubtle,
		color: vars.destructive,
	},
});

export interface SureBadgeProps {
	tone?: SureTone;
	children: React.ReactNode;
}

const BADGE_TONE: Record<SureTone, SureStyle> = {
	info: badgeStyles.info,
	success: badgeStyles.success,
	warning: badgeStyles.warning,
	destructive: badgeStyles.destructive,
	neutral: badgeStyles.neutral,
};

export function SureBadge({ tone = "neutral", children }: SureBadgeProps): React.ReactElement {
	return (
		<span {...stylex.props(sureFont.base, badgeStyles.root, BADGE_TONE[tone])}>{children}</span>
	);
}
