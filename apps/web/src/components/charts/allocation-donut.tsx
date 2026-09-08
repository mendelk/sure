// Allocation donut prototype (t_alt_fnd_016).
//
// Polar composition per the TanStack polar recipe: the eager `pie`
// transform allocates non-negative values into angular intervals, then
// `radialArc` paints them inside `polar` with a responsive inner radius
// (donut; `0` would make it a pie). Slice identity is the stable `id` field
// (domain, arc key, legend key): duplicate holding *labels* stay distinct
// slices with stable colors and selection. Negative inputs are clamped to
// zero before allocation (documented below); an empty or all-zero dataset
// renders the shared empty state instead of a blank ring.
//
// Privacy note: the hover/focus tooltip is built by the `content` callback
// below from the injected labels and copy, so masked values stay masked
// there too — the default tooltip formats raw data independently of
// `SureChartLabels` and must not be used.
import { defineChart } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { Chart } from "@tanstack/charts/react";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo, useState } from "react";
import type { AllocationCopy } from "./chart-copy";
import { applyCountTemplate, applyTitleTemplate, defaultAllocationCopy } from "./chart-copy";
import type { SureChartLabels } from "./chart-format";
import { useChartEnvironment } from "./chart-environment";
import type { SureChartPalette } from "./chart-palette";
import { sureChartTheme } from "./chart-palette";
import { SureChartDataTable, SureChartFigure, SureChartLegend } from "./sure-chart-host";
import { SureEmptyState } from "~/components/ui/card";

export interface AllocationSlice {
	/** Stable identity for color scale, arc key, and legend key. */
	readonly id: string;
	/** Display name (need not be unique). */
	readonly label: string;
	readonly amount: number;
}

export interface AllocationDonutProps {
	readonly slices: readonly AllocationSlice[];
	readonly title: string;
	readonly description?: string | undefined;
	readonly labels: SureChartLabels;
	/** Localizable strings (t_alt_fnd_011 owns these eventually). */
	readonly copy?: AllocationCopy | undefined;
	readonly idPrefix?: string | undefined;
	/** Unallocated remainder painted with chartUnallocatedFill; omitted when 0. */
	readonly unallocatedAmount?: number | undefined;
	readonly onSelectionChange?: ((slice: AllocationSlice | null) => void) | undefined;
}

const CHART_HEIGHT = 300;
const SSR_WIDTH = 640;
/** Fixed identity for the synthetic unallocated remainder entry. */
const REMAINDER_ID = "sure-unallocated";

function colorForIndex(palette: readonly string[], index: number): string {
	const first = palette[0];
	if (first === undefined) {
		throw new Error("[sure-charts] allocation palette must not be empty.");
	}
	return palette[index % palette.length] ?? first;
}

/** Remainder (last entry) uses the unallocated fill; slices cycle the palette. */
function entryColor(
	palette: SureChartPalette,
	entryCount: number,
	hasRemainder: boolean,
	index: number,
): string {
	if (hasRemainder && index === entryCount - 1) {
		return palette.unallocated;
	}
	return colorForIndex(palette.allocation, index);
}

export function AllocationDonut({
	slices,
	title,
	description,
	labels,
	copy,
	idPrefix,
	unallocatedAmount,
	onSelectionChange,
}: AllocationDonutProps): React.ReactElement {
	const { theme, reducedMotion } = useChartEnvironment();
	const [selected, setSelected] = useState<AllocationSlice | null>(null);
	// Memoized so an omitted `copy` (or a stable theme) never rebuilds the
	// TanStack definition on unrelated re-renders such as selection.
	const text = useMemo(() => copy ?? defaultAllocationCopy(), [copy]);
	const chartTheme = useMemo(() => sureChartTheme(theme), [theme]);

	// The pie transform allocates non-negative values only: clamp negatives
	// so a bad upstream row degrades to a zero slice instead of breaking
	// allocation. Totals, percents, and the data table all use the clamped
	// values so every surface agrees.
	const sanitized: AllocationSlice[] = useMemo(
		() =>
			slices.map((slice) => ({
				id: slice.id,
				label: slice.label,
				amount: Math.max(0, slice.amount),
			})),
		[slices],
	);
	const remainder = Math.max(0, unallocatedAmount ?? 0);
	const entries: AllocationSlice[] = useMemo(
		() =>
			remainder > 0
				? [...sanitized, { id: REMAINDER_ID, label: text.unallocatedLabel, amount: remainder }]
				: [...sanitized],
		[sanitized, remainder, text],
	);
	const total = entries.reduce((sum, slice) => sum + slice.amount, 0);

	const { palette, foreground, muted, grid, background } = chartTheme;
	const hasRemainder = remainder > 0;

	const domain = useMemo(() => entries.map((slice) => slice.id), [entries]);
	const range = useMemo(
		() => entries.map((_, index) => entryColor(palette, entries.length, hasRemainder, index)),
		[entries, hasRemainder, palette],
	);
	const definition = useMemo(() => {
		const allocated = pie(entries, { value: "amount" });
		return defineChart({
			marks: [
				polar({
					inset: 8,
					radiusRatio: 0.82,
					marks: [
						radialArc(allocated, {
							innerRadius: ({ radius }) => radius * 0.58,
							cornerRadius: 4,
							color: "id",
							key: "id",
						}),
					],
					scales: { angle: null, radius: null },
				}),
			],
			scales: { x: null, y: null },
			color: { domain, range },
			defaultTheme: {
				foreground,
				muted,
				grid,
				background,
				palette: [...range, palette.unallocated],
			},
			svgAnimation: !reducedMotion,
			tooltip: {
				use: tooltip,
				content: (focused) => {
					const first = focused[0];
					return {
						title: first?.datum.label ?? title,
						rows: focused.map((point) => ({
							label: text.tooltipValueLabel,
							value: `${labels.formatCurrency(point.datum.amount)} (${labels.formatPercent(total === 0 ? 0 : point.datum.amount / total)})`,
						})),
					};
				},
			},
		});
	}, [
		entries,
		domain,
		range,
		palette,
		foreground,
		muted,
		grid,
		background,
		labels,
		text,
		title,
		total,
		reducedMotion,
	]);

	if (entries.length === 0 || total === 0) {
		return (
			<SureChartFigure title={title} description={description}>
				<SureEmptyState title={text.emptyTitle} description={text.emptyDescription} />
			</SureChartFigure>
		);
	}

	return (
		<SureChartFigure title={title} description={description}>
			<Chart
				definition={definition}
				height={CHART_HEIGHT}
				initialWidth={SSR_WIDTH}
				ariaLabel={title}
				ariaDescription={description ?? applyCountTemplate(text.summaryTemplate, entries.length)}
				idPrefix={idPrefix ?? "sure-allocation"}
				tabIndex={0}
				onSelect={(point) => {
					const next = point === null ? null : point.datum;
					setSelected(next);
					onSelectionChange?.(next);
				}}
			/>
			<SureChartLegend
				label={text.legendLabel}
				items={entries.map((slice, index) => ({
					key: slice.id,
					label: slice.label,
					color: entryColor(palette, entries.length, hasRemainder, index),
					value: `${labels.formatCurrency(slice.amount)} (${labels.formatPercent(total === 0 ? 0 : slice.amount / total)})`,
				}))}
			/>
			{selected === null ? null : (
				<p data-testid="allocation-selection">
					{text.selectedPrefix} {selected.label}:{" "}
					{labels.formatCurrency(Math.max(0, selected.amount))}
				</p>
			)}
			<p data-testid="allocation-total">
				{text.totalLabel}: {labels.formatCurrency(total)}
			</p>
			<SureChartDataTable
				caption={applyTitleTemplate(text.tableCaptionTemplate, title)}
				headers={[
					text.tableHolding,
					`${text.tableValueBase} (${labels.currency})`,
					text.tableShare,
				]}
				rows={entries.map(
					(slice) =>
						[
							slice.label,
							labels.formatCurrency(slice.amount),
							labels.formatPercent(total === 0 ? 0 : slice.amount / total),
						] as readonly string[],
				)}
			/>
		</SureChartFigure>
	);
}
