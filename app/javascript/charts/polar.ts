import {
  defineChart,
  type ChartPoint,
  type ChartTooltipOptions,
  type DomChartDefinition,
} from "@tanstack/charts";
import { pie, polar, radialArc, type PieDatum } from "@tanstack/charts/polar";
import { chartTheme, chartColors } from "./theme";
import { chartTooltip } from "./tooltip";

export type PolarSlice = { id: string; label: string; value: number; color?: string };
export type PolarDatum<T extends PolarSlice> = PieDatum<T>;
export type PolarOptions<T extends PolarSlice> = {
  innerRadiusRatio: number;
  interactive?: boolean;
  tooltip?: ChartTooltipOptions<PolarDatum<T>, number, number>;
  radiusRatio?: number;
  gapAngle?: number;
  opacity?: number;
};

// pie owns allocation and radialArc owns responsive geometry. Never inflate small
// amounts: the center, table, and painted shares describe the same financial data.
export function polarDefinition<T extends PolarSlice>(
  slices: readonly T[],
  options: PolarOptions<T>,
): DomChartDefinition<PolarDatum<T>, number, number> {
  const allocated = pie(slices, { value: (slice) => slice.value, gapAngle: options.gapAngle ?? 0 });
  const visible = polar({
    id: "financial-polar",
    radiusRatio: options.radiusRatio ?? 0.96,
    marks: [
      radialArc(allocated, {
        id: "financial-slices",
        className: "financial-visible-slices",
        key: (slice) => slice.source[0].id,
        color: (slice) => slice.source[0].id,
        fill: (slice) => slice.source[0].color ?? chartColors.balance,
        innerRadius: ({ radius }) => radius * options.innerRadiusRatio,
        cornerRadius: options.innerRadiusRatio > 0 ? 2 : 0,
        opacity: options.opacity ?? 1,
      }),
    ],
    scales: { angle: null, radius: null },
  });
  return defineChart({
    theme: chartTheme,
    marks: [visible],
    scales: { x: null, y: null },
    margin: 0,
    focus: options.interactive === false ? false : undefined,
    pointer: options.interactive !== false,
    keyboard: options.interactive !== false,
    focusRing: false,
    tooltip: options.tooltip === undefined ? false : { ...options.tooltip, use: chartTooltip },
  });
}

// TanStack 0.18 radialArc has no inline states. Paint only attributes on the
// native keyed paths; focus never replaces definitions or click targets.
export function paintPolarFocus<T extends PolarSlice>(
  container: HTMLElement,
  points: readonly ChartPoint<PolarDatum<T>, number, number>[],
  selectedId: string | null,
) {
  const byKey = new Map(points.map((point) => [point.key, point.datum.source[0]]));
  for (const path of container.querySelectorAll<SVGPathElement>(
    ".financial-visible-slices path[data-ts-key]",
  )) {
    const slice = byKey.get(path.dataset.tsKey ?? "");
    if (!slice) continue;
    const selected = selectedId === slice.id;
    path.dataset.segmentId = slice.id;
    path.style.fill =
      selectedId !== null
        ? selected
          ? (slice.color ?? chartColors.balance)
          : "var(--budget-unallocated-fill, var(--color-container-inset))"
        : "";
  }
}
