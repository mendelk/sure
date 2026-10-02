import { useMemo } from "react";
import { defineChart } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { tooltip as exampleTooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import type { PivotResult } from "./api/transactions";

export interface PivotPieSlice {
  label: string;
  value: number;
  fraction: number;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatSlicePercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function pivotPieSlices(result: PivotResult): PivotPieSlice[] | undefined {
  const measureKey = result.columns.find((column) => column.startsWith("measure_"));
  if (measureKey === undefined || result.series.length > 0) return undefined;
  const slices: PivotPieSlice[] = [];
  for (const row of result.rows) {
    const value = toFiniteNumber(row[measureKey]);
    if (value === undefined || value < 0) return undefined;
    const rawLabel = row.pivot_category;
    const label =
      rawLabel === null || rawLabel === undefined
        ? "(blank)"
        : typeof rawLabel === "string"
          ? rawLabel.length === 0
            ? "(blank)"
            : rawLabel
          : JSON.stringify(rawLabel);
    slices.push({ label, value, fraction: 0 });
  }
  if (slices.length === 0) return undefined;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!(total > 0)) return undefined;
  const withFractions: PivotPieSlice[] = [];
  for (const slice of slices) {
    withFractions.push({
      label: slice.label,
      value: slice.value,
      fraction: slice.value / total,
    });
  }
  return withFractions;
}

export function PivotPieChart({ result, reportName }: { result: PivotResult; reportName: string }) {
  const slices = useMemo(() => pivotPieSlices(result), [result]);
  const definition = useMemo(() => {
    if (slices === undefined) return null;
    const pieData = pie(slices, {
      value: (slice) => slice.value,
      gapAngle: 0.02,
    });
    return defineChart(
      {
        marks: [
          polar({
            inset: 0,
            radiusRatio: 0.8,
            marks: [
              radialArc(pieData, {
                id: "pivot-slices",
                key: (datum) => datum.label,
                color: (datum) => datum.label,
              }),
            ],
            scales: { angle: null, radius: null },
          }),
        ],
        scales: { x: null, y: null },
        color: { range: ["#2563eb", "#7c3aed", "#db2777", "#f59e0b"] },
        margin: 0,
      },
      {
        keyboard: true,
        tooltip: {
          use: exampleTooltip,
          format: ({ datum }: { datum: Partial<PivotPieSlice> }) => {
            const label = typeof datum.label === "string" ? datum.label : "Slice";
            const fraction = typeof datum.fraction === "number" ? datum.fraction : 0;
            return `${label} · ${formatSlicePercent(fraction)}`;
          },
        },
      },
    );
  }, [slices]);

  if (slices === undefined || definition === null) return null;

  return (
    <div className="rounded-xl border border-secondary bg-container p-3 shadow-border-xs">
      <Chart ariaLabel={`${reportName} pie chart`} definition={definition} height={260} />
      <ul className="mt-2 space-y-1 text-xs text-secondary" aria-label={`${reportName} slices`}>
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{slice.label}</span>
            <span className="shrink-0 tabular-nums">
              {slice.label} · {formatSlicePercent(slice.fraction)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
