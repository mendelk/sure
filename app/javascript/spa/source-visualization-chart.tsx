// eslint-disable import/max-dependencies -- Reusable chart rendering uses the installed marks, scales, tooltip, and React adapter.
import { useMemo } from "react";
import { barY, defineChart, lineY, type ChartTooltipInput } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import type { DashboardLayoutProps } from "./dashboard-storage";
import type { SourceColumn, SourceData } from "./source";
import type { ReportRowId } from "./ids";

export type ChartSettings = Omit<DashboardLayoutProps["Chart"], "sourceId" | "id">;
export type SourceChartPoint = { id: ReportRowId; label: string; value: number; position: number };
export type SourceChartGroup = { currency: string; points: SourceChartPoint[] };
export type SourceChartMapping = {
  category: SourceColumn;
  value: SourceColumn;
  groups: SourceChartGroup[];
};
export type SourceChartError =
  | "source_chart_invalid_fields"
  | "source_chart_no_values"
  | "source_chart_invalid_values"
  | "source_chart_missing_currency"
  | "source_chart_negative_pie";

export function categoryColumns(columns: SourceColumn[]): SourceColumn[] {
  return columns.filter((column) => column.kind === "text" || column.kind === "date");
}

export function valueColumns(columns: SourceColumn[]): SourceColumn[] {
  return columns.filter((column) => column.kind === "number" || column.kind === "currency");
}

export function sourceChartMapping(
  data: SourceData,
  settings: ChartSettings,
): SourceChartMapping | SourceChartError {
  const categories = categoryColumns(data.columns);
  const category = settings.categoryField
    ? categories.find((column) => column.key === settings.categoryField)
    : settings.chartType === "line"
      ? (categories.find((column) => column.kind === "date") ?? categories[0])
      : (categories.find((column) => column.kind === "text") ?? categories[0]);
  const values = valueColumns(data.columns);
  const value = settings.valueField
    ? values.find((column) => column.key === settings.valueField)
    : values[0];
  if (!category || !value) return "source_chart_invalid_fields";
  const groups = new Map<string, SourceChartGroup>();
  for (const row of data.rows) {
    const cell = row.values[value.key];
    if (cell === null || cell === undefined || cell === "") continue;
    const number = typeof cell === "number" ? cell : Number(cell);
    if (!Number.isFinite(number) || (typeof cell === "string" && cell.trim() === ""))
      return "source_chart_invalid_values";
    if (settings.chartType === "pie" && number < 0) return "source_chart_negative_pie";
    const currency = value.currency ?? row.currency;
    if (value.kind === "currency" && !currency) return "source_chart_missing_currency";
    const categoryValue = row.values[category.key];
    if (categoryValue === null || categoryValue === undefined || categoryValue === "")
      return "source_chart_invalid_values";
    let group = groups.get(currency);
    if (!group) {
      group = { currency, points: [] };
      groups.set(currency, group);
    }
    group.points.push({
      id: row.id,
      label: String(categoryValue),
      value: number,
      position: group.points.length,
    });
  }
  if (groups.size === 0) return "source_chart_no_values";
  if (settings.chartType === "pie") {
    for (const group of groups.values()) {
      const total = group.points.reduce((sum, point) => sum + point.value, 0);
      if (!Number.isFinite(total)) return "source_chart_invalid_values";
      if (!(total > 0)) return "source_chart_no_values";
    }
  }
  return { category, value, groups: [...groups.values()] };
}

export function SourceResultChart({
  mapping,
  chartType,
  label,
}: {
  mapping: SourceChartMapping;
  chartType: ChartSettings["chartType"];
  label: string;
}) {
  return (
    <div className="space-y-3">
      {mapping.groups.map((group) => (
        <SourceChartGroupView
          key={group.currency}
          group={group}
          mapping={mapping}
          chartType={chartType}
          label={label}
        />
      ))}
    </div>
  );
}

function SourceChartGroupView({
  group,
  mapping,
  chartType,
  label,
}: {
  group: SourceChartGroup;
  mapping: SourceChartMapping;
  chartType: ChartSettings["chartType"];
  label: string;
}) {
  const definition = useMemo(() => {
    const chartTooltip = {
      use: tooltip,
      format: ({ datum }) =>
        `${mapping.category.label}: ${datum.label}\n${mapping.value.label}: ${datum.value.toLocaleString()}`,
    } satisfies ChartTooltipInput<SourceChartPoint>;
    if (chartType === "pie") {
      const pieData = pie(group.points, { value: (point) => point.value, gapAngle: 0.02 });
      return defineChart(
        {
          marks: [
            polar({
              inset: 0,
              radiusRatio: 0.8,
              marks: [
                radialArc(pieData, { key: (point) => point.id, color: (point) => point.label }),
              ],
              scales: { angle: null, radius: null },
            }),
          ],
          scales: { x: null, y: null },
          margin: 0,
        },
        { keyboard: true, tooltip: chartTooltip },
      );
    }
    return defineChart({
      marks: [
        chartType === "bar"
          ? barY(group.points, { x: "position", y1: 0, y2: "value" })
          : lineY(group.points, { x: "position", y: "value", points: true }),
      ],
      scales: {
        x: {
          scale:
            chartType === "bar" ? () => scaleBand().padding(0.2) : () => scalePoint().padding(0.5),
          axis: {
            label: mapping.category.label,
            ticks: { format: (position: number) => group.points.at(position)?.label ?? "" },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { label: [mapping.value.label, group.currency].filter(Boolean).join(" · ") },
        },
      },
      tooltip: chartTooltip,
    });
  }, [group, mapping.category.label, mapping.value.label, chartType]);
  const chartLabel = [label, group.currency].filter(Boolean).join(" · ");
  return (
    <div className="rounded-xl border border-secondary bg-container p-3 shadow-border-xs">
      {group.currency && <p className="mb-2 text-sm font-medium text-primary">{group.currency}</p>}
      <Chart ariaLabel={chartLabel} definition={definition} height={260} />
      <ul aria-label={chartLabel} className="sr-only">
        {group.points.map((point) => (
          <li key={point.id} className="flex items-baseline justify-between gap-2">
            <span>{point.label}</span>
            <span className="tabular-nums">
              {point.value}
              {mapping.value.kind === "currency" && group.currency ? ` ${group.currency}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
