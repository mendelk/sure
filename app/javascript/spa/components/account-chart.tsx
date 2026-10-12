// eslint-disable import/max-dependencies -- The shared chart composes exact-subpath chart marks, scales, accessible interactions, and standard controls.
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useMemo, useState } from "react";
import { defineChart, lineY, ruleX, type ChartTooltipInput } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { brushX, type BrushRange, type BrushXChange } from "@tanstack/charts/interaction/brush";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import type { AccountChart, AccountSearch } from "../api/accounts";
import { AccountCards, ACCOUNT_COLORS } from "./account-sections";
import { Button } from "./button";
import { Alert } from "./alert";
import { FormField } from "./form-field";
import { CategoryIcon } from "../icon";
import { createChartCursor, cursorHost } from "@tanstack/charts/cursor";
import { chartTooltip } from "./chart-tooltip";

type PlotPoint = {
  date: string;
  timestamp: number;
  value: number;
  formatted: string;
  series: string;
};
function timestamp(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}
export function AccountTimeSeriesChart({
  chart,
  text,
  selectable,
  onSearchChange,
}: {
  chart: AccountChart;
  text: Record<string, string>;
  selectable: boolean;
  onSearchChange: (patch: Partial<AccountSearch>) => void;
}) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [],
  );
  const series = useMemo(
    () =>
      chart.series.map((item) => ({
        ...item,
        points: item.points.map((point): PlotPoint => ({
          ...point,
          timestamp: timestamp(point.date),
          series: item.label,
        })),
      })),
    [chart.series],
  );
  const dates = useMemo(
    () =>
      [...new Set(series.flatMap((item) => item.points.map((point) => point.timestamp)))].toSorted(
        (a, b) => a - b,
      ),
    [series],
  );
  const [range, setRange] = useState<BrushRange<number>>({
    start: dates[0] ?? timestamp(chart.period.start_date),
    end: dates.at(-1) ?? timestamp(chart.period.end_date),
  });
  const [coarsePointer] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [cursor] = useState(() => createChartCursor<number, number>());
  const definition = useMemo(() => {
    const tooltipOptions = {
      use: chartTooltip,
      formatGroup: (points) =>
        points.length === 0
          ? ""
          : [
              formatter.format(points[0].datum.timestamp),
              ...points.map(({ datum }) => `${datum.series}: ${datum.formatted}`),
            ].join("\n"),
    } satisfies ChartTooltipInput<PlotPoint>;
    return defineChart({
      marks: [
        ...series.map((item) =>
          lineY(item.points, {
            id: item.key,
            x: "timestamp",
            y: "value",
            z: () => item.key,
            stroke: ACCOUNT_COLORS[item.tone],
            strokeWidth: 2.25,
            strokeDasharray: item.dashed ? "5 4" : undefined,
            points: item.points.length === 1,
          }),
        ),
        ruleX(
          chart.markers.map((marker) => ({ ...marker, timestamp: timestamp(marker.date) })),
          {
            x: "timestamp",
            stroke: "var(--utility-text-secondary)",
            strokeWidth: 1,
            strokeDasharray: "2 4",
          },
        ),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          axis: { ticks: { count: 4, format: (value: number) => formatter.format(value) } },
        },
        y: { scale: scaleLinear, nice: true, axis: false },
      },
      focus: "group-x",
      cursor: { use: cursorHost, controller: cursor, mode: "focus", match: "x", pin: false },
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: tooltipOptions,
      controls:
        selectable && !coarsePointer && dates.length > 1
          ? [
              brushX({
                range: controlledSignal<BrushRange<number>, BrushXChange<number>>(
                  range,
                  (next, { reason }) => {
                    if (reason.type === "commit" && next.start !== next.end) {
                      setRange(next);
                      onSearchChange({
                        period: undefined,
                        start_date: new Date(next.start).toISOString().slice(0, 10),
                        end_date: new Date(next.end).toISOString().slice(0, 10),
                      });
                    }
                  },
                ),
                values: dates,
                format: (value) => formatter.format(value),
                ariaLabel: text.period,
                startAriaLabel: text.start_date,
                endAriaLabel: text.end_date,
              }),
            ]
          : [],
    });
  }, [
    series,
    dates,
    range,
    formatter,
    selectable,
    coarsePointer,
    cursor,
    onSearchChange,
    text,
    chart.markers,
  ]);
  if (dates.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-secondary">
        {chart.no_data_label}
      </p>
    );
  }
  return (
    <div className="privacy-sensitive min-w-0">
      <Chart
        definition={definition}
        height={256}
        ariaLabel={chart.aria_description ?? chart.title}
      />
      <ul className="sr-only">
        {series.map((item) => (
          <li key={item.key}>
            {item.label}
            <ul>
              {item.points.map((point) => (
                <li key={point.date}>
                  {formatter.format(point.timestamp)}: {point.formatted}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function AccountChartCard({
  chart,
  text,
  selectable,
  onSearchChange,
}: {
  chart: AccountChart;
  text: Record<string, string>;
  selectable: boolean;
  onSearchChange: (patch: Partial<AccountSearch>) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  return (
    <section className="space-y-4 rounded-xl bg-container p-4 shadow-border-xs">
      <div className="flex flex-col-reverse justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm text-secondary">{chart.title}</p>
            {chart.breakdown.length > 0 ? (
              <Popover className="relative">
                <PopoverButton
                  as={Button}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={chart.title}
                  title={chart.title}
                >
                  <CategoryIcon name="info" />
                </PopoverButton>
                <PopoverPanel className="shadow-border-lg absolute left-0 z-30 mt-2 w-64 space-y-2 rounded-xl bg-container p-4">
                  {chart.breakdown.map((card) => (
                    <div key={card.label} className="flex justify-between gap-3 text-sm">
                      <span className="text-secondary">{card.label}</span>
                      <span className="privacy-sensitive tabular-nums text-primary">
                        {card.value}
                      </span>
                    </div>
                  ))}
                </PopoverPanel>
              </Popover>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <p className="privacy-sensitive text-3xl font-medium tabular-nums text-primary">
              {chart.value}
            </p>
            {chart.converted_value !== null && chart.converted_value !== "" ? (
              <p className="privacy-sensitive text-sm text-secondary">{chart.converted_value}</p>
            ) : null}
          </div>
          <p className="mt-2 text-sm">
            <span
              className={`privacy-sensitive ${chart.trend.direction === "flat" ? "text-secondary" : chart.trend.favorable ? "text-success" : "text-destructive"}`}
            >
              {chart.trend.direction === "up" ? "↗" : chart.trend.direction === "down" ? "↘" : "−"}{" "}
              {chart.trend.value} ({chart.trend.percent})
            </span>
            <span className="ml-2 text-secondary">{chart.trend.comparison_label}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {chart.views.length > 1 ? (
            <FormField
              as="select"
              id="account-chart-view"
              aria-label={text.chart_view}
              value={chart.view}
              onChange={(event) => {
                onSearchChange({ chart_view: event.target.value });
              }}
            >
              {chart.views.map((view) => (
                <option key={view.key} value={view.key}>
                  {view.label}
                </option>
              ))}
            </FormField>
          ) : null}
          <FormField
            as="select"
            id="account-chart-period"
            aria-label={text.period}
            value={chart.period.key ?? "custom"}
            onChange={(event) => {
              if (event.target.value === "custom") setRangeOpen(true);
              else {
                onSearchChange({
                  period: event.target.value,
                  start_date: undefined,
                  end_date: undefined,
                });
              }
            }}
          >
            {chart.periods.map((period) => (
              <option key={period.key} value={period.key}>
                {period.label}
              </option>
            ))}
            {chart.period.key === null ? (
              <option value="custom">{chart.period.label}</option>
            ) : null}
          </FormField>
          {selectable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRangeOpen(!rangeOpen);
              }}
              aria-expanded={rangeOpen}
            >
              {text.apply_range}
            </Button>
          ) : null}
        </div>
      </div>
      {rangeOpen ? (
        <AccountRangeForm
          key={`${chart.period.start_date}-${chart.period.end_date}`}
          chart={chart}
          text={text}
          onApply={(start, end) => {
            onSearchChange({ period: undefined, start_date: start, end_date: end });
            setRangeOpen(false);
          }}
        />
      ) : null}
      <AccountCards cards={chart.cards} />
      {chart.notices.map((notice) => (
        <Alert key={notice} variant="warning">
          {notice}
        </Alert>
      ))}
      <AccountTimeSeriesChart
        key={`${chart.view}-${chart.period.start_date}-${chart.period.end_date}`}
        chart={chart}
        text={text}
        selectable={selectable}
        onSearchChange={onSearchChange}
      />
      {chart.series.length > 1 || chart.markers.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-4 text-xs text-secondary">
          {chart.series.map((series) => (
            <li key={series.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`w-6 border-t-2 ${series.dashed ? "border-dashed" : "border-solid"}`}
                style={{ borderColor: ACCOUNT_COLORS[series.tone] }}
              />
              {series.label}
            </li>
          ))}
          {chart.markers.map((marker) => (
            <li key={marker.date} className="flex items-center gap-2">
              <span aria-hidden="true" className="w-6 border-t border-dotted border-primary" />
              {marker.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AccountRangeForm({
  chart,
  text,
  onApply,
}: {
  chart: AccountChart;
  text: Record<string, string>;
  onApply: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(chart.period.start_date);
  const [end, setEnd] = useState(chart.period.end_date);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(start, end);
      }}
    >
      <FormField
        id="account-range-start"
        name="start_date"
        type="date"
        required
        label={text.start_date}
        value={start}
        onChange={(event) => {
          setStart(event.target.value);
        }}
      />
      <FormField
        id="account-range-end"
        name="end_date"
        type="date"
        required
        label={text.end_date}
        value={end}
        min={start}
        onChange={(event) => {
          setEnd(event.target.value);
        }}
      />
      <Button type="submit" size="sm">
        {text.apply_range}
      </Button>
    </form>
  );
}
