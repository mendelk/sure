import { useMemo } from "react";
import { defineChart, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import type { LifetimeProjectionPoint } from "./lifetime-projection";

export function ProjectionChart({
  horizonYears,
  money,
  points,
}: {
  horizonYears: number;
  money: Intl.NumberFormat;
  points: LifetimeProjectionPoint[];
}) {
  const definition = useMemo(() => {
    if (points.length === 0) return null;
    const tickInterval = Math.max(1, Math.ceil((points.length - 1) / 5));
    const tickYears = points
      .filter((_, index) => index % tickInterval === 0 || index === points.length - 1)
      .map((point) => point.year);

    return defineChart({
      marks: [
        lineY(points, {
          x: "year",
          y: "netWorth",
          points: true,
          strokeWidth: 3,
        }),
      ],
      scales: {
        x: {
          scale: () => scalePoint().padding(0.5),
          axis: {
            label: "Year",
            ticks: { values: tickYears },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            label: "Projected net worth",
            ticks: { format: (value: number) => money.format(value) },
          },
        },
      },
      tooltip,
    });
  }, [money, points]);

  if (definition === null) return null;

  return (
    <Chart
      ariaLabel={`Projected net worth over ${horizonYears} years`}
      definition={definition}
      height={256}
    />
  );
}
