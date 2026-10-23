// eslint-disable import/max-dependencies -- The shared chart composes exact-subpath chart marks, scales, accessible interactions, and standard controls.
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Component, useMemo, useState } from "react";
import { defineChart, lineY, ruleX, type ChartTooltipInput } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import type { ZoomXWindow } from "@tanstack/charts/interaction/zoom";
import { useDebouncedValue } from "@tanstack/react-pacer/debouncer";
import type { AccountChart, AccountSearch } from "../api/accounts";
import { AccountCards, ACCOUNT_COLORS } from "./account-sections";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Alert } from "./alert";
import { FormField } from "./form-field";
import { CategoryIcon } from "../icon";
import { chartTheme } from "../../charts/theme";
import { utcDayDomain, utcDayTimestamp } from "../../charts/time";
import { chartTooltip } from "../../charts/tooltip";
import { useTimeSeriesInteraction } from "./use-time-series-interaction";

type PlotPoint = {
  date: string;
  timestamp: number;
  value: number;
  formatted: string;
  series: string;
};

function chartPeriodWindow(chart: AccountChart): ZoomXWindow<number> {
  const [start, end] = utcDayDomain(
    utcDayTimestamp(chart.period.start_date),
    utcDayTimestamp(chart.period.end_date),
  );
  return { start, end };
}

export function AccountTimeSeriesChart({
  chart,
  selectable,
  viewport,
  onViewportChange,
}: {
  chart: AccountChart;
  selectable: boolean;
  viewport: ZoomXWindow<number>;
  onViewportChange: (viewport: ZoomXWindow<number>) => void;
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
          timestamp: utcDayTimestamp(point.date),
          series: item.label,
        })),
      })),
    [chart.series],
  );
  const pointTimestamps = useMemo(
    () => series.flatMap((item) => item.points.map((point) => point.timestamp)),
    [series],
  );
  const { start: periodStart, end: periodEnd } = chartPeriodWindow(chart);
  const fullStart = Math.min(periodStart, ...pointTimestamps);
  const fullEnd = Math.max(periodEnd, ...pointTimestamps);
  const { interaction, hostProps } = useTimeSeriesInteraction({
    enabled: selectable,
    pointCount: pointTimestamps.length,
    start: fullStart,
    end: fullEnd,
    viewport,
    onViewportChange,
    title: chart.title,
    formatter,
  });
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
    } satisfies ChartTooltipInput<PlotPoint, number, number, "dom">;
    return defineChart({
      theme: chartTheme,
      ...interaction,
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
          chart.markers.map((marker) => ({
            ...marker,
            timestamp: utcDayTimestamp(marker.date),
          })),
          {
            x: "timestamp",
            stroke: "var(--utility-text-secondary)",
            strokeWidth: 1,
            strokeDasharray: "2 4",
          },
        ),
      ],
      clip: true,
      scales: {
        x: {
          scale: scaleLinear([fullStart, fullEnd], [0, 1]),
          viewport: { domain: [viewport.start, viewport.end] },
          axis: {
            ticks: {
              count: 4,
              format: (value: number) => formatter.format(value),
            },
          },
        },
        y: { scale: scaleLinear, nice: true, axis: false },
      },
      tooltip: tooltipOptions,
    });
  }, [series, fullStart, fullEnd, viewport, formatter, interaction, chart.markers]);
  if (pointTimestamps.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-secondary">
        {chart.no_data_label}
      </p>
    );
  }
  return (
    <div className="privacy-sensitive min-w-0" {...hostProps}>
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
type AccountChartCardProps = {
  chart: AccountChart;
  text: Record<string, string>;
  selectable: boolean;
  onSearchChange: (patch: Partial<AccountSearch>) => void;
};

type AccountChartCardState = { failed: boolean; chart: AccountChart };

export class AccountChartCard extends Component<AccountChartCardProps, AccountChartCardState> {
  state: AccountChartCardState = { failed: false, chart: this.props.chart };

  static getDerivedStateFromProps(
    props: AccountChartCardProps,
    state: AccountChartCardState,
  ): Partial<AccountChartCardState> | null {
    return props.chart === state.chart ? null : { failed: false, chart: props.chart };
  }

  static getDerivedStateFromError(): Partial<AccountChartCardState> {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Alert variant="error" live="alert">
          <p>{this.props.text.chart_unavailable}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              this.setState({ failed: false });
            }}
          >
            {this.props.text.retry}
          </Button>
        </Alert>
      );
    }
    return <AccountChartCardContent {...this.props} />;
  }
}

function AccountChartCardContent({
  chart,
  text,
  selectable,
  onSearchChange,
}: AccountChartCardProps) {
  // The zoom window is a local viewport onto the loaded series: pan/zoom never
  // navigates, so the page does not refetch or lose focus mid-gesture. While
  // zoomed, the preset dropdown no longer describes what is shown, so it is
  // disabled and the visible range is shown with a way back.
  const { start: periodStart, end: periodEnd } = chartPeriodWindow(chart);
  const [viewport, setViewport] = useState<ZoomXWindow<number> | null>(null);
  const periodKey = `${chart.view}-${chart.period.start_date}-${chart.period.end_date}`;
  const [syncedPeriodKey, setSyncedPeriodKey] = useState(periodKey);
  if (periodKey !== syncedPeriodKey) {
    setSyncedPeriodKey(periodKey);
    setViewport(null);
  }
  const effectiveViewport = viewport ?? { start: periodStart, end: periodEnd };
  const zoomedOut = effectiveViewport.start <= periodStart && effectiveViewport.end >= periodEnd;
  // The dropdown row shows the live window while gesturing; the text settles
  // after quiet so it does not flicker through every preview frame.
  const [debouncedViewport] = useDebouncedValue(effectiveViewport, {
    wait: 200,
  });
  const visibleRange = useMemo(
    () =>
      new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [],
  );
  const resetViewport = () => {
    setViewport(null);
  };
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("account-chart-collapsed") === "true";
    } catch {
      return false;
    }
  });
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
          {!collapsed ? (
            <p className="mt-2 text-sm">
              <span
                className={`privacy-sensitive ${chart.trend.direction === "flat" ? "text-secondary" : chart.trend.favorable ? "text-success" : "text-destructive"}`}
              >
                {chart.trend.direction === "up"
                  ? "↗"
                  : chart.trend.direction === "down"
                    ? "↘"
                    : "−"}{" "}
                {chart.trend.value} ({chart.trend.percent})
              </span>
              <span className="ml-2 text-secondary">{chart.trend.comparison_label}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!collapsed && chart.views.length > 1 ? (
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
          {!collapsed && !zoomedOut ? (
            <output className="privacy-sensitive flex items-center gap-2 text-sm tabular-nums text-secondary">
              {visibleRange.format(debouncedViewport.start)} –{" "}
              {visibleRange.format(debouncedViewport.end)}
              <Button size="sm" variant="ghost" onClick={resetViewport}>
                {text.reset_zoom}
              </Button>
            </output>
          ) : null}
          <div>
            <FormField
              as="select"
              id="account-chart-period"
              aria-label={text.period}
              value={chart.period.key ?? chart.periods[0]?.key}
              disabled={!zoomedOut}
              title={!zoomedOut ? text.reset_zoom : undefined}
              onChange={(event) => {
                onSearchChange({
                  period: event.target.value,
                  start_date: undefined,
                  end_date: undefined,
                });
              }}
            >
              {chart.periods.map((period) => (
                <option key={period.key} value={period.key}>
                  {period.label}
                </option>
              ))}
            </FormField>
          </div>
          <IconButton
            icon={collapsed ? "chevron-down" : "chevron-up"}
            label={collapsed ? text.expand_chart : text.collapse_chart}
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              try {
                localStorage.setItem("account-chart-collapsed", String(next));
              } catch {
                /* Ignore unavailable storage */
              }
            }}
            size="sm"
          />
        </div>
      </div>
      {!collapsed ? (
        <>
          <AccountCards cards={chart.cards} />
          {chart.notices.map((notice) => (
            <Alert key={notice} variant="warning">
              {notice}
            </Alert>
          ))}
          <AccountTimeSeriesChart
            key={`${chart.view}-${chart.period.start_date}-${chart.period.end_date}`}
            chart={chart}
            selectable={selectable}
            viewport={effectiveViewport}
            onViewportChange={setViewport}
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
        </>
      ) : null}
    </section>
  );
}
