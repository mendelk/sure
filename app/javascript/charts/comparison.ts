import {
  barY,
  crosshair,
  defineChart,
  dot,
  group,
  lineY,
  type ChartTooltipInput,
  type DomChartDefinition,
} from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { chartColors, chartTheme } from "./theme";
import { chartTooltip } from "./tooltip";

export type MoneyFlowBar = {
  date: string;
  label: string;
  short_label: string;
  income: number;
  expense: number;
  highlighted: boolean;
  partial: boolean;
};

export type MoneyFlowOptions = {
  currency: string;
  locale?: string;
  incomeLabel: string;
  expenseLabel: string;
};

type MoneyFlowPoint = MoneyFlowBar & {
  month: number;
  series: "income" | "expense";
  value: number;
};

export type SpendingPoint = {
  day: number;
  value: number;
  date: string;
  date_formatted: string;
};

export type SpendingData = {
  days: number;
  axis_labels: string[];
  current: SpendingPoint[];
  previous: SpendingPoint[];
};

export type SpendingOptions = {
  currency: string;
  locale?: string;
  currentLabel: string;
  previousLabel: string;
};

type SpendingPlotPoint = SpendingPoint & {
  series: "current" | "previous";
};

const color = (point: MoneyFlowPoint) =>
  point.series === "income" ? chartColors.income : chartColors.expense;
export function moneyFlowDefinition(bars: MoneyFlowBar[], options: MoneyFlowOptions) {
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
    maximumFractionDigits: 0,
  });
  const points: MoneyFlowPoint[] = bars.flatMap((bar, month) => [
    { ...bar, month, series: "income", value: bar.income },
    { ...bar, month, series: "expense", value: bar.expense },
  ]);
  const tooltip: ChartTooltipInput<MoneyFlowPoint, number, number, "dom"> = {
    use: chartTooltip,
    sticky: false,
    content: (focused) => ({
      title: focused[0]?.datum.label,
      rows: focused
        .toSorted(
          (a, b) => Number(a.datum.series === "expense") - Number(b.datum.series === "expense"),
        )
        .map(({ datum }) => ({
          label: datum.series === "income" ? options.incomeLabel : options.expenseLabel,
          value: formatter.format(datum.value),
          color: color(datum),
        })),
    }),
  };

  return defineChart({
    theme: chartTheme,
    scales: {
      x: {
        scale: scaleBand(
          bars.map((_, index) => index),
          [0, 1],
        ).padding(0.3),
        axis: {
          line: false,
          ticks: {
            size: 0,
            format: (value: number) => bars[value]?.short_label || bars[value]?.label || "",
          },
          tickLabels: {
            fontWeight: ({ value }: { value: number }) => (bars[value]?.highlighted ? 600 : 500),
            opacity: ({ value }: { value: number }) => (bars[value]?.highlighted ? 1 : 0.7),
            thin: {
              minGap: 8,
              priority: "ends",
              keep: bars.flatMap((bar, index) => (bar.highlighted ? [index] : [])),
            },
          },
        },
      },
      y: {
        scale: scaleLinear([0, Math.max(1, ...points.map((point) => point.value)) * 1.1], [0, 1]),
        axis: false,
      },
    },
    marks: [
      barY(points, {
        id: "money-flow",
        key: (point) => `${point.date}:${point.series}`,
        x: "month",
        y: "value",
        z: "series",
        layout: group({ padding: 0.12 }),
        maxThickness: 22,
        radius: { end: 3 },
        fill: (point) =>
          point.partial ? `color-mix(in srgb, ${color(point)} 50%, transparent)` : color(point),
        states: [{ when: { focus: "group" }, style: { stroke: chartColors.text, strokeWidth: 1 } }],
      }),
    ],
    focus: "group-x",
    maxFocusDistance: Infinity,
    tooltip,
  });
}

export type MoneyFlowDefinition = DomChartDefinition<MoneyFlowPoint, number, number>;

export function spendingDefinition(data: SpendingData, options: SpendingOptions) {
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
  });
  const tickFormatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  // Keep server-provided ordinals. A longer previous month may fold its final
  // real date onto the selected month's final day; timestamps cannot align it.
  const current: SpendingPlotPoint[] = data.current.map((point) => ({
    ...point,
    series: "current",
  }));
  const previous: SpendingPlotPoint[] = data.previous.map((point) => ({
    ...point,
    series: "previous",
  }));
  const endpoint = current.at(-1);
  const maxValue = Math.max(
    1,
    ...current.map((point) => point.value),
    ...previous.map((point) => point.value),
  );
  const days = Math.max(1, data.days);
  const colors = { current: chartColors.income, previous: chartColors.comparison };
  const tooltip: ChartTooltipInput<SpendingPlotPoint, number, number, "dom"> = {
    use: chartTooltip,
    sticky: false,
    content: (focused) => {
      const points = focused.toSorted(
        (a, b) => Number(a.datum.series === "previous") - Number(b.datum.series === "previous"),
      );
      return {
        title: points[0]?.datum.date_formatted,
        rows: points.map(({ datum }) => ({
          label: `${datum.series === "current" ? options.currentLabel : options.previousLabel} · ${datum.date_formatted}`,
          value: formatter.format(datum.value),
          color: colors[datum.series],
        })),
      };
    },
  };
  const marks = [
    lineY(previous, {
      id: "previous",
      key: "day",
      x: "day",
      y: "value",
      z: "series",
      stroke: chartColors.comparison,
      strokeWidth: 1.5,
      points: previous.length === 1,
    }),
    lineY(current, {
      id: "current",
      key: "day",
      x: "day",
      y: "value",
      z: "series",
      stroke: chartColors.income,
      strokeWidth: 2,
      points: current.length === 1,
    }),
    decorative(
      dot(endpoint === undefined ? [] : [endpoint], {
        x: "day",
        y: "value",
        fill: chartColors.income,
        r: 3.5,
      }),
    ),
    crosshair({
      x: { stroke: chartColors.muted, strokeDasharray: "4 4" },
      y: false,
      marker: false,
    }),
  ];

  return defineChart({
    chart: ({ width }) => {
      const span = width < 640 ? Math.min(days, endpoint?.day ?? days) : days;
      const tickDays = [...new Set([1, Math.round((1 + span) / 2), span])];
      return {
        theme: chartTheme,
        marks,
        scales: {
          x: {
            scale: scaleLinear(days === 1 ? [0.5, 1.5] : [1, days], [0, 1]),
            axis: {
              line: false,
              ticks: {
                size: 0,
                values: tickDays,
                format: (day: number) => data.axis_labels[day - 1] ?? String(day),
              },
              tickLabels: { thin: { minGap: 12, priority: "ends" } },
            },
          },
          y: {
            scale: scaleLinear([0, maxValue * 1.05], [0, 1]),
            nice: true,
            side: "right" as const,
            grid: { stroke: chartColors.grid, strokeDasharray: "4 4", strokeOpacity: 0.6 },
            axis: {
              line: false,
              ticks: { size: 0, count: 4, format: (value: number) => tickFormatter.format(value) },
            },
          },
        },
      };
    },
    focus: "group-x",
    maxFocusDistance: Infinity,
    tooltip,
  });
}

export type SpendingDefinition = DomChartDefinition<SpendingPlotPoint, number, number>;
