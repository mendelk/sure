// Responsive net-worth line/area prototype (t_alt_fnd_016).
//
// Application-owned interface: feature code passes data + injectable
// `SureChartLabels` and `NetWorthCopy` and never touches `@tanstack/charts`.
// The TanStack definition (areaY + lineY, point x-scale, linear y-scale) is
// rebuilt only when semantic inputs change (data, token-derived palette,
// labels, copy, reduced-motion flag). SSR/hydration safety comes from
// `useChartEnvironment` (light/reduced fallbacks match server HTML) and the
// adapter's `initialWidth` server render.
//
// Privacy note: the hover/focus tooltip is built by the `content` callback
// below from the injected labels, so masked values stay masked there too —
// the default tooltip formats raw data independently of `SureChartLabels`
// and must not be used.
import { areaY, defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo, useState } from "react";
import type { NetWorthCopy } from "./chart-copy";
import { applyCountTemplate, applyTitleTemplate, defaultNetWorthCopy } from "./chart-copy";
import type { SureChartLabels } from "./chart-format";
import { useChartEnvironment } from "./chart-environment";
import { sureChartTheme } from "./chart-palette";
import { SureChartDataTable, SureChartFigure } from "./sure-chart-host";
import { SureEmptyState } from "~/components/ui/card";

export interface NetWorthPoint {
	readonly month: string;
	readonly value: number;
}

export interface NetWorthChartProps {
	readonly points: readonly NetWorthPoint[];
	readonly title: string;
	readonly description?: string | undefined;
	readonly labels: SureChartLabels;
	/** Localizable strings (t_alt_fnd_011 owns these eventually). */
	readonly copy?: NetWorthCopy | undefined;
	readonly idPrefix?: string | undefined;
	readonly onSelectionChange?: ((point: NetWorthPoint | null) => void) | undefined;
}

const CHART_HEIGHT = 280;
const SSR_WIDTH = 640;

export function NetWorthChart({
	points,
	title,
	description,
	labels,
	copy,
	idPrefix,
	onSelectionChange,
}: NetWorthChartProps): React.ReactElement {
	const { theme, reducedMotion } = useChartEnvironment();
	const [selected, setSelected] = useState<NetWorthPoint | null>(null);
	// Memoized so an omitted `copy` (or a stable theme) never rebuilds the
	// TanStack definition on unrelated re-renders such as selection.
	const text = useMemo(() => copy ?? defaultNetWorthCopy(), [copy]);
	const chartTheme = useMemo(() => sureChartTheme(theme), [theme]);

	const { palette, foreground, muted, grid, background } = chartTheme;
	const definition = useMemo(
		() =>
			defineChart({
				marks: [
					areaY(points, {
						x: "month",
						y: "value",
						fill: palette.primary,
						fillOpacity: 0.18,
					}),
					lineY(points, {
						x: "month",
						y: "value",
						stroke: palette.primary,
						strokeWidth: 2.5,
						points: points.length <= 24,
					}),
				],
				scales: {
					x: { scale: () => scalePoint().padding(0.2) },
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
					palette: [palette.primary],
				},
				svgAnimation: !reducedMotion,
				tooltip: {
					use: tooltip,
					content: (focused) => {
						const first = focused[0];
						return {
							title: first?.datum.month ?? title,
							rows: focused.map((point) => ({
								label: text.tooltipValueLabel,
								value: labels.formatCurrency(point.datum.value),
							})),
						};
					},
				},
			}),
		[points, palette, foreground, muted, grid, background, labels, text, title, reducedMotion],
	);

	if (points.length === 0) {
		return (
			<SureChartFigure title={title} description={description}>
				<SureEmptyState title={text.emptyTitle} description={text.emptyDescription} />
			</SureChartFigure>
		);
	}

	const selectedLabel =
		selected === null ? null : `${selected.month}: ${labels.formatCurrency(selected.value)}`;

	return (
		<SureChartFigure title={title} description={description}>
			<Chart
				definition={definition}
				height={CHART_HEIGHT}
				initialWidth={SSR_WIDTH}
				ariaLabel={title}
				ariaDescription={description ?? applyCountTemplate(text.summaryTemplate, points.length)}
				idPrefix={idPrefix ?? "sure-net-worth"}
				tabIndex={0}
				onSelect={(point) => {
					const next = point === null ? null : point.datum;
					setSelected(next);
					onSelectionChange?.(next);
				}}
			/>
			{selectedLabel === null ? null : (
				<p data-testid="net-worth-selection">
					{text.selectedPrefix} {selectedLabel}
				</p>
			)}
			<SureChartDataTable
				caption={applyTitleTemplate(text.tableCaptionTemplate, title)}
				headers={[text.tableMonth, `${text.tableValueBase} (${labels.currency})`]}
				rows={points.map(
					(row) => [row.month, labels.formatCurrency(row.value)] as readonly string[],
				)}
			/>
		</SureChartFigure>
	);
}
