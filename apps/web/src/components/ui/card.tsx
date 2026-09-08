// SureCard + SureSkeleton + SureEmptyState (apps/web).
//
// Content containers. Card is pure composition (Header/Title/Description/
// Content/Footer) — no behavior. Skeleton marks loading regions with
// aria-busy; empty states pair a title, description, and one action.
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { formatMessage } from "~/lib/i18n/messages";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureFont, sureMotion } from "./sure-styles";

const cardStyles = stylex.create({
	root: {
		backgroundColor: vars.container,
		color: vars.textPrimary,
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: vars.borderSecondary,
		borderRadius: vars.radiusLg,
		boxShadow: vars.shadowXs,
		overflow: "clip",
	},
	header: {
		display: "flex",
		flexDirection: "column",
		gap: 4,
		paddingBlock: 16,
		paddingInline: 20,
		borderBottomStyle: "solid",
		borderBottomWidth: 1,
		borderBottomColor: vars.borderSubdued,
	},
	title: {
		marginTop: 0,
		marginBottom: 0,
		fontSize: 16,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
	},
	description: {
		fontSize: 13,
		color: vars.textSecondary,
	},
	content: {
		paddingBlock: 16,
		paddingInline: 20,
		fontSize: 14,
		color: vars.textPrimary,
	},
	footer: {
		display: "flex",
		justifyContent: "flex-end",
		flexWrap: "wrap",
		gap: 8,
		paddingBlock: 12,
		paddingInline: 20,
		borderTopStyle: "solid",
		borderTopWidth: 1,
		borderTopColor: vars.borderSubdued,
	},
});

export function SureCard({ children }: { children: React.ReactNode }): React.ReactElement {
	return <article {...stylex.props(sureFont.base, cardStyles.root)}>{children}</article>;
}

export function SureCardHeader({ children }: { children: React.ReactNode }): React.ReactElement {
	return <div {...stylex.props(cardStyles.header)}>{children}</div>;
}

export function SureCardTitle({ children }: { children: React.ReactNode }): React.ReactElement {
	return <h3 {...stylex.props(cardStyles.title)}>{children}</h3>;
}

export function SureCardDescription({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return <p {...stylex.props(cardStyles.description)}>{children}</p>;
}

export function SureCardContent({ children }: { children: React.ReactNode }): React.ReactElement {
	return <div {...stylex.props(cardStyles.content)}>{children}</div>;
}

export function SureCardFooter({ children }: { children: React.ReactNode }): React.ReactElement {
	return <div {...stylex.props(cardStyles.footer)}>{children}</div>;
}

const sureShimmer = stylex.keyframes({
	"0%": { opacity: 1 },
	"50%": { opacity: 0.55 },
	"100%": { opacity: 1 },
});

const skeletonStyles = stylex.create({
	region: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
	},
	bar: {
		height: 14,
		borderRadius: 6,
		backgroundColor: vars.bgLoader,
	},
	short: {
		width: "62%",
	},
	shimmer: {
		"@media (prefers-reduced-motion: no-preference)": {
			animationName: sureShimmer,
			animationDuration: "1600ms",
			animationTimingFunction: "ease-in-out",
			animationIterationCount: "infinite",
		},
	},
});

export interface SureSkeletonProps {
	/** Accessible label for the loading region. Defaults to "Loading". */
	label?: string;
	/** Number of bars to render. Defaults to 3. */
	lines?: number;
}

export function SureSkeleton({
	label = formatMessage("ui.loading"),
	lines = 3,
}: SureSkeletonProps): React.ReactElement {
	const count = Math.max(1, Math.min(8, Math.floor(lines)));
	return (
		<div
			role="status"
			aria-label={label}
			aria-busy="true"
			{...stylex.props(skeletonStyles.region, sureMotion.allowOnly)}
		>
			{Array.from({ length: count }, (_, index) => (
				<div
					key={index}
					aria-hidden="true"
					{...stylex.props(
						skeletonStyles.bar,
						skeletonStyles.shimmer,
						index === count - 1 && skeletonStyles.short,
					)}
				/>
			))}
		</div>
	);
}

const emptyStyles = stylex.create({
	root: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 8,
		paddingBlock: 32,
		paddingInline: 20,
		textAlign: "center",
	},
	icon: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: 44,
		height: 44,
		marginBottom: 4,
		borderRadius: "50%",
		backgroundColor: vars.surface,
		color: vars.textSubdued,
	},
	title: {
		marginTop: 0,
		marginBottom: 0,
		fontSize: 16,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
	},
	description: {
		marginTop: 0,
		marginBottom: 8,
		maxWidth: 420,
		fontSize: 14,
		color: vars.textSecondary,
	},
});

export interface SureEmptyStateProps {
	title: string;
	description?: string;
	/** Decorative glyph (aria-hidden icon). */
	icon?: React.ReactNode;
	/** Single primary action (SureButton / SureLink). */
	action?: React.ReactNode;
	children?: React.ReactNode;
}

export function SureEmptyState({
	title,
	description,
	icon,
	action,
	children,
}: SureEmptyStateProps): React.ReactElement {
	return (
		<section aria-label={title} {...stylex.props(sureFont.base, emptyStyles.root)}>
			{icon != null ? (
				<span aria-hidden="true" {...stylex.props(emptyStyles.icon)}>
					{icon}
				</span>
			) : null}
			<h3 {...stylex.props(emptyStyles.title)}>{title}</h3>
			{description != null && description !== "" ? (
				<p {...stylex.props(emptyStyles.description)}>{description}</p>
			) : null}
			{action}
			{children}
		</section>
	);
}
