// Grouped cash-flow bar prototype (t_alt_fnd_016).
//
// One barY mark over long-form rows (month x series), side-by-side geometry
// via `layout: group()` with `z` carrying subgroup identity. Series paint
// comes from a per-datum `fill` resolved against the semantic palette
// (income -> success, expenses -> destructive), so no raw literals reach
// the scene. Negative amounts diverge from zero; axis ticks reuse the
// injected currency formatter (masked automatically in privacy mode).
//
// Privacy note: the hover/focus tooltip is built by the `content` callback
// below from the injected labels and copy, so masked values stay masked
// there too — the default tooltip formats raw data independently of
// `SureChartLabels` and must not be used.
import { barY, defineChart, group } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo, useState } from "react";
import type { CashFlowCopy } from "./chart-copy";
import { applyCountTemplate, applyTitleTemplate, defaultCashFlowCopy } from "./chart-copy";
import type { SureChartLabels } from "./chart-format";
import { useChartEnvironment } from "./chart-environment";
import { sureChartTheme } from "./chart-palette";
import { SureChartDataTable, SureChartFigure, SureChartLegend } from "./sure-chart-host";
import { SureEmptyState } from "~/components/ui/card";

export type CashFlowSeries = "income" | "expenses";

export interface CashFlowPoint {
	readonly month: string;
	readonly series: CashFlowSeries;
	readonly amount: number;
}

export interface CashFlowChartProps {
	readonly points: readonly CashFlowPoint[];
	readonly title: string;
	readonly description?: string | undefined;
	readonly labels: SureChartLabels;
	/** Localizable strings (t_alt_fnd_011 owns these eventually). */
	readonly copy?: CashFlowCopy | undefined;
	readonly idPrefix?: string | undefined;
	readonly onSelectionChange?: ((point: CashFlowPoint | null) => void) | undefined;
}

const CHART_HEIGHT = 300;
const SSR_WIDTH = 640;

export function CashFlowChart({
	points,
	title,
	description,
	labels,
	copy,
	idPrefix,
	onSelectionChange,
}: CashFlowChartProps): React.ReactElement {
	const { theme, reducedMotion } = useChartEnvironment();
	const [selected, setSelected] = useState<CashFlowPoint | null>(null);
	// Memoized so an omitted `copy` (or a stable theme) never rebuilds the
	// TanStack definition on unrelated re-renders such as selection.
	const text = useMemo(() => copy ?? defaultCashFlowCopy(), [copy]);
	const chartTheme = useMemo(() => sureChartTheme(theme), [theme]);

	function seriesName(series: CashFlowSeries): string {
		return series === "income" ? text.seriesIncome : text.seriesExpenses;
	}

	const { palette, foreground, muted, grid, background } = chartTheme;
	const definition = useMemo(
		() =>
			defineChart({
				marks: [
					barY(points, {
						x: "month",
						y: "amount",
						z: "series",
						color: "series",
						layout: group(),
						fill: (row) => (row.series === "income" ? palette.positive : palette.negative),
					}),
				],
				scales: {
					x: { scale: () => scaleBand().padding(0.24) },
					y: {
						scale: scaleLinear,
						nice: true,
						grid: true,
						axis: {
							label: `${text.axisBase} (${labels.currency})`,
							ticks: { format: (value) => labels.formatCurrency(value) },
						},
					},
				},
				defaultTheme: {
					foreground,
					muted,
					grid,
					background,
					palette: [palette.positive, palette.negative],
				},
				svgAnimation: !reducedMotion,
				tooltip: {
					use: tooltip,
					content: (focused) => {
						const first = focused[0];
						return {
							title: first?.datum.month ?? title,
							rows: focused.map((point) => ({
								label: seriesName(point.datum.series),
								value: labels.formatCurrency(point.datum.amount),
							})),
						};
					},
				},
			}),
		// `seriesName` closes over `text`, which is already a dep below.
		[points, palette, foreground, muted, grid, background, labels, text, title, reducedMotion],
	);

	if (points.length === 0) {
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
				ariaDescription={description ?? applyCountTemplate(text.summaryTemplate, points.length)}
				idPrefix={idPrefix ?? "sure-cash-flow"}
				tabIndex={0}
				onSelect={(point) => {
					const next = point === null ? null : point.datum;
					setSelected(next);
					onSelectionChange?.(next);
				}}
			/>
			<SureChartLegend
				label={text.legendLabel}
				items={[
					{
						key: "income",
						label: text.seriesIncome,
						color: palette.positive,
						value: labels.formatCurrency(
							points
								.filter((row) => row.series === "income")
								.reduce((sum, row) => sum + row.amount, 0),
						),
					},
					{
						key: "expenses",
						label: text.seriesExpenses,
						color: palette.negative,
						value: labels.formatCurrency(
							points
								.filter((row) => row.series === "expenses")
								.reduce((sum, row) => sum + row.amount, 0),
						),
					},
				]}
			/>
			{selected === null ? null : (
				<p data-testid="cash-flow-selection">
					{text.selectedPrefix} {selected.month} {seriesName(selected.series)}:{" "}
					{labels.formatCurrency(selected.amount)}
				</p>
			)}
			<SureChartDataTable
				caption={applyTitleTemplate(text.tableCaptionTemplate, title)}
				headers={[text.tableMonth, text.tableSeries, `${text.tableValueBase} (${labels.currency})`]}
				rows={points.map(
					(row) =>
						[
							row.month,
							seriesName(row.series),
							labels.formatCurrency(row.amount),
						] as readonly string[],
				)}
			/>
		</SureChartFigure>
	);
}
