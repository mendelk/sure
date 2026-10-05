import type { PivotConfig } from "@cubejs-client/core";
import * as z from "zod/mini";
import type { CubeReportSettings } from "./cube-dashboard-storage";
import { cubeGroupKey, cubeMeasureLabel } from "./cube-dashboard-storage";
import { CubeApiError, type CubeResult } from "./api/cube";
import type { PivotResult } from "./api/transactions";
import { CubeReportTable } from "./cube-report-table";
import { ReportChart } from "./report-chart";
import { PivotPieChart, pivotPieSlices } from "./pivot-pie-chart";

const ChartPointSchema = z.object({ x: z.string(), value: z.number() });

function exactValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  throw new CubeApiError("", 200, true);
}

export function CubeReportResult({
  result,
  settings,
  name,
  text,
}: {
  result: CubeResult;
  settings: CubeReportSettings;
  name: string;
  text: Record<string, string>;
}) {
  const rawRows = result.resultSet.rawData();
  const groupKey = cubeGroupKey(settings);
  const pivot: PivotConfig = { x: [groupKey], y: ["measures"], fillMissingDates: false };
  const rawByGroup = new Map(
    rawRows.map((row) => [String(row[groupKey] ?? row["cash_flow.date"] ?? text.empty), row]),
  );
  const groupSchema = z.object({
    [groupKey]: z.nullable(z.union([z.string(), z.number()])),
  });
  const pivotedRows: unknown[] = result.resultSet.tablePivot(pivot);
  const columns = result.resultSet.tableColumns(pivot).flatMap((column) => {
    const measure = settings.measures.find((member) => member === column.dataIndex);
    return measure === undefined ? [] : [{ column, measure }];
  });
  const tableRows = pivotedRows.map((pivotedRow, index) => {
    const group = String(groupSchema.parse(pivotedRow)[groupKey] ?? text.empty);
    const source = rawByGroup.get(group);
    if (source === undefined) throw new CubeApiError("", 200, true);
    // tablePivot fills null measures with zero. The raw result preserves the
    // distinction and decimal strings; only chart series may cast numerics.
    return {
      key: String(index),
      label: group,
      values: columns.map(({ measure }) => exactValue(source[measure])),
    };
  });
  const tableColumns = columns.map(({ measure }) => ({
    id: measure,
    label: cubeMeasureLabel(measure, text),
  }));
  const measure = settings.measures[0];
  const validChartValues =
    settings.presentation !== "table" &&
    settings.measures.length === 1 &&
    rawRows.every((row) => {
      const value = row[measure];
      return (
        (typeof value === "number" || (typeof value === "string" && value.trim().length > 0)) &&
        Number.isFinite(Number(value))
      );
    });
  const series = validChartValues
    ? result.resultSet.series(pivot).find((item) => item.key === measure)
    : undefined;
  const sdkPoints: unknown[] = series?.series ?? [];
  const points = sdkPoints.map((value) => {
    const point = ChartPointSchema.parse(value);
    return {
      label: point.x,
      time: settings.grouping === "date" ? Date.parse(point.x) : Number.NaN,
      value: point.value,
    };
  });
  const pieResult: PivotResult | undefined =
    settings.presentation === "pie"
      ? {
          sql: "",
          categories: points.map((point) => point.label),
          series: [],
          measures: [
            { field: measure, aggregation: "sum", label: cubeMeasureLabel(measure, text) },
          ],
          columns: ["pivot_category", "measure_0"],
          rows: points.map((point) => ({ pivot_category: point.label, measure_0: point.value })),
          row_count: points.length,
          truncated: result.truncated,
          fields: [],
        }
      : undefined;
  const chartReady =
    points.length === rawRows.length &&
    points.length > 0 &&
    points.every((point) => Number.isFinite(point.value)) &&
    (pieResult === undefined ||
      (Number.isFinite(points.reduce((sum, point) => sum + point.value, 0)) &&
        pivotPieSlices(pieResult) !== undefined));

  return (
    <div className="space-y-3">
      {settings.presentation !== "table" && rawRows.length > 0 ? (
        chartReady ? (
          <div className="space-y-2">
            <p className="text-xs text-secondary">
              {cubeMeasureLabel(measure, text)} · {result.currency}
            </p>
            {settings.presentation === "line" ? (
              <div className="[&>div>p]:hidden">
                <ReportChart
                  reportName={name}
                  mapping={{
                    xColumn: text[settings.grouping],
                    yColumn: cubeMeasureLabel(measure, text),
                    points,
                  }}
                />
              </div>
            ) : pieResult !== undefined ? (
              <PivotPieChart reportName={name} result={pieResult} />
            ) : null}
          </div>
        ) : (
          <output className="block text-sm text-secondary">{text.chart_unavailable}</output>
        )
      ) : null}
      <CubeReportTable
        rows={tableRows}
        columns={tableColumns}
        currency={result.currency}
        name={name}
        groupLabel={text[settings.grouping]}
        emptyText={text.empty}
      />
    </div>
  );
}
