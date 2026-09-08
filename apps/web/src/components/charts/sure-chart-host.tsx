// Shared Sure chart chrome (t_alt_fnd_016).
//
// Application-owned wrapper around the TanStack adapter: figure semantics,
// a visually-hidden data table (every plotted value stays available to
// screen readers regardless of Alpha SVG internals), and a visible legend
// list. Feature code composes these primitives; it never imports
// `@tanstack/charts` directly — only the three chart components do, and
// only through their own definition builders.
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";
import { vars } from "~/styles/sure-tokens.stylex";
import { sureA11y, sureFocus, sureFont } from "~/components/ui/sure-styles";

const hostStyles = stylex.create({
	figure: {
		marginTop: 0,
		marginBottom: 0,
		marginLeft: 0,
		marginRight: 0,
		display: "flex",
		flexDirection: "column",
		gap: 12,
		minWidth: 0,
	},
	title: {
		marginTop: 0,
		marginBottom: 0,
		fontSize: 15,
		fontWeight: vars.fontWeightSemibold,
		color: vars.textPrimary,
	},
	description: {
		marginTop: 0,
		marginBottom: 0,
		fontSize: 13,
		color: vars.textSecondary,
	},
	chartBox: {
		minWidth: 0,
		width: "100%",
		borderRadius: vars.radiusMd,
	},
	legendList: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
		listStyleType: "none",
		marginTop: 0,
		marginBottom: 0,
		paddingLeft: 0,
		fontSize: 13,
		color: vars.textSecondary,
	},
	legendItem: {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
	},
	swatch: {
		width: 12,
		height: 12,
		borderRadius: 3,
		flexShrink: 0,
	},
	table: {
		borderCollapse: "collapse",
	},
});

export interface SureChartLegendItem {
	/** Stable React key (identity, not the display label). */
	readonly key: string;
	readonly label: string;
	/** Semantic-token-derived swatch fill (never a raw literal). */
	readonly color: string;
	readonly value: string;
}

function LegendSwatch({ color }: { color: string }): React.ReactElement {
	return (
		<span
			aria-hidden="true"
			style={{ backgroundColor: color }}
			{...stylex.props(hostStyles.swatch)}
		/>
	);
}

export function SureChartLegend({
	items,
	label,
}: {
	items: readonly SureChartLegendItem[];
	/** Accessible name from chart copy (never hardcoded — see chart-copy.ts). */
	label: string;
}): React.ReactElement | null {
	if (items.length === 0) {
		return null;
	}
	return (
		<ul aria-label={label} {...stylex.props(hostStyles.legendList)}>
			{items.map((item) => (
				<li key={item.key} {...stylex.props(hostStyles.legendItem)}>
					<LegendSwatch color={item.color} />
					<span>
						{item.label}: {item.value}
					</span>
				</li>
			))}
		</ul>
	);
}

export interface SureChartTableProps {
	readonly caption: string;
	readonly headers: readonly string[];
	readonly rows: readonly (readonly string[])[];
}

/**
 * Visually-hidden data table: the screen-reader source of truth for every
 * chart. Values arrive pre-formatted (and pre-masked) from the injected
 * `SureChartLabels`, so privacy mode needs no table-side branching.
 */
export function SureChartDataTable({
	caption,
	headers,
	rows,
}: SureChartTableProps): React.ReactElement {
	return (
		<table {...stylex.props(sureA11y.visuallyHidden, hostStyles.table)}>
			<caption>{caption}</caption>
			<thead>
				<tr>
					{headers.map((header) => (
						<th key={header} scope="col">
							{header}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, index) => (
					<tr key={`${caption}-${String(index)}`}>
						{row.map((cell, cellIndex) => (
							<td key={cellIndex}>{cell}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export interface SureChartFigureProps {
	readonly title: string;
	readonly description?: string | undefined;
	readonly children: React.ReactNode;
}

/** Figure chrome shared by every Sure chart (title, description, plot). */
export function SureChartFigure({
	title,
	description,
	children,
}: SureChartFigureProps): React.ReactElement {
	return (
		<figure {...stylex.props(sureFont.base, hostStyles.figure)}>
			<figcaption>
				<h3 {...stylex.props(hostStyles.title)}>{title}</h3>
				{description !== undefined && description !== "" ? (
					<p {...stylex.props(hostStyles.description)}>{description}</p>
				) : null}
			</figcaption>
			<div {...stylex.props(hostStyles.chartBox, sureFocus.ring)}>{children}</div>
		</figure>
	);
}
