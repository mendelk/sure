import { useMemo } from "react";
import { defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { Chart } from "@tanstack/charts/react";
import type { ChartMapping } from "./report-chart-mapping";

function formatTickLabel(time: number): string {
  const date = new Date(time);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ReportChart({
  mapping,
  reportName,
}: {
  mapping: ChartMapping;
  reportName: string;
}) {
  const definition = useMemo(() => {
    const rows = mapping.points.map((point, index) => ({
      // Even spacing in encounter order; the axis ticks carry the dates.
      position: index,
      label: point.label,
      time: point.time,
      value: point.value,
    }));
    const seenDays = new Set<string>();
    const tickValues = rows
      .filter((row) => {
        if (Number.isNaN(row.time)) return true;
        const day = new Date(row.time).toDateString();
        if (seenDays.has(day)) return false;
        seenDays.add(day);
        return true;
      })
      .filter((row, index, all) => index % Math.max(1, Math.floor(all.length / 5)) === 0)
      .map((row) => row.position);
    return defineChart({
      marks: [lineY(rows, { x: "position", y: "value", points: true })],
      scales: {
        x: {
          scale: () => scalePoint().padding(0.5),
          axis: {
            label: mapping.xColumn,
            ticks: {
              values: tickValues,
              format: (position: number) => {
                const row = rows.at(position);
                if (row === undefined) return "";
                return Number.isNaN(row.time) ? row.label : formatTickLabel(row.time);
              },
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { label: mapping.yColumn },
        },
      },
      tooltip,
    });
  }, [mapping]);

  return (
    <div className="rounded-xl border border-secondary bg-container p-3 shadow-border-xs">
      <Chart ariaLabel={`${reportName} chart`} definition={definition} height={260} />
      <p className="mt-2 text-xs text-secondary">
        {mapping.yColumn} by {mapping.xColumn} · {mapping.points.length} points
      </p>
    </div>
  );
}
