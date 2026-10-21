// Net worth widget: headline total + trend vs comparison label, series chart.
// Money arrives server-formatted; render verbatim. Reuses the TanStack
// time-series pattern from AccountTimeSeriesChart (lineY + zoomX + cursor).
import { Component, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { defineChart, lineY, ruleX, type ChartTooltipInput } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { zoomX, type ZoomXChange, type ZoomXWindow } from "@tanstack/charts/interaction/zoom";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { createChartCursor, cursorHost } from "@tanstack/charts/cursor";
import { chartTooltip } from "../components/chart-tooltip";
import type { HomeNetWorth } from "./home-api";

export type NetWorthData = HomeNetWorth;

const DEFAULT_TEXT = {
  noData: "Data not available for the selected period",
} as const;

type PlotPoint = {
  date: string;
  timestamp: number;
  value: number;
  formatted: string;
};

function timestampOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function NetWorthChart({ series, title }: { series: PlotPoint[]; title: string }) {
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
  const pointTimestamps = useMemo(() => series.map((point) => point.timestamp), [series]);
  const fullStart = Math.min(...pointTimestamps);
  const fullEnd = Math.max(...pointTimestamps);
  const [viewport, setViewport] = useState<ZoomXWindow<number>>({ start: fullStart, end: fullEnd });
  const [isCoarsePointer] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const hostRef = useRef<HTMLDivElement>(null);
  const focusZoomSurface = () => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest("input, textarea, select, [contenteditable='true']")
    )
      return;
    hostRef.current
      ?.querySelector<SVGElement>("[data-chart-zoom-surface]")
      ?.focus({ preventScroll: true });
  };
  const [cursor] = useState(() => createChartCursor<number, number>());

  const definition = useMemo(() => {
    const tooltipOptions = {
      use: chartTooltip,
      formatGroup: (points) =>
        points.length === 0
          ? ""
          : [
              formatter.format(points[0]?.datum.timestamp ?? 0),
              ...points.map(({ datum }) => datum.formatted),
            ].join("\n"),
    } satisfies ChartTooltipInput<PlotPoint>;
    const zoomable = !isCoarsePointer && pointTimestamps.length > 1 && fullEnd > fullStart;
    return defineChart({
      marks: [
        lineY(series, {
          id: "net-worth",
          x: "timestamp",
          y: "value",
          z: () => "net-worth",
          stroke: "var(--utility-text-primary)",
          strokeWidth: 2.25,
          points: series.length === 1,
        }),
        ruleX([], { x: "timestamp" }),
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
      focus: "group-x",
      cursor: {
        use: cursorHost,
        controller: cursor,
        mode: "focus",
        match: "x",
        pin: false,
      },
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: tooltipOptions,
      controls: zoomable
        ? [
            zoomX({
              window: controlledSignal<ZoomXWindow<number>, ZoomXChange<number>>(
                viewport,
                (next, { reason }) => {
                  if (reason.type === "cancel") {
                    setViewport({ start: reason.origin.start, end: reason.origin.end });
                    return;
                  }
                  if (next.start === next.end) return;
                  setViewport({ start: next.start, end: next.end });
                },
              ),
              extent: [fullStart, fullEnd],
              ariaLabel: title,
              format: (value) => formatter.format(value),
            }),
          ]
        : [],
    });
  }, [
    series,
    fullStart,
    fullEnd,
    pointTimestamps,
    viewport,
    formatter,
    isCoarsePointer,
    cursor,
    title,
  ]);

  if (pointTimestamps.length === 0) return null;

  return (
    <div
      className="privacy-sensitive min-w-0"
      ref={hostRef}
      onPointerEnter={focusZoomSurface}
      onFocusCapture={focusZoomSurface}
    >
      <Chart definition={definition} height={208} ariaLabel={title} />
      <ul className="sr-only">
        {series.map((point) => (
          <li key={point.date}>
            {formatter.format(point.timestamp)}: {point.formatted}
          </li>
        ))}
      </ul>
    </div>
  );
}

type NetWorthWidgetState = { failed: boolean };

class NetWorthErrorBoundary extends Component<{ children: ReactNode }, NetWorthWidgetState> {
  state: NetWorthWidgetState = { failed: false };

  static getDerivedStateFromError(): NetWorthWidgetState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function NetWorthWidget({
  netWorth,
  title,
  text = DEFAULT_TEXT,
}: {
  netWorth: NetWorthData;
  title: string;
  text?: typeof DEFAULT_TEXT;
}) {
  const series: PlotPoint[] = useMemo(
    () =>
      netWorth.series.map((point) => ({
        date: point.date,
        timestamp: timestampOf(point.date),
        value: Number(point.value.amount),
        formatted: point.value.formatted,
      })),
    [netWorth.series],
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4 px-4">
        <div className="space-y-2">
          {netWorth.trend ? (
            <>
              <p
                className={`privacy-sensitive -space-x-0.5 text-3xl font-medium text-primary ${netWorth.syncing ? "animate-pulse" : ""}`}
              >
                {netWorth.trend.current.formatted}
              </p>
              <p className="privacy-sensitive text-sm" style={{ color: netWorth.trend.color }}>
                <span className="font-mono">
                  {netWorth.trend.change.formatted} ({netWorth.trend.percent})
                </span>
                {netWorth.comparison_label !== null && netWorth.comparison_label !== "" ? (
                  <span className="text-secondary"> {netWorth.comparison_label}</span>
                ) : null}
              </p>
            </>
          ) : (
            <p className="text-sm text-secondary">{text.noData}</p>
          )}
        </div>
      </div>
      {series.length > 0 ? (
        <div
          className="privacy-sensitive min-h-52 size-full"
          style={{ height: "var(--dash-widget-h, 13rem)" }}
        >
          <NetWorthErrorBoundary>
            <NetWorthChart series={series} title={title} />
          </NetWorthErrorBoundary>
        </div>
      ) : (
        <div className="flex size-full items-center justify-center">
          <p className="text-sm text-secondary">{text.noData}</p>
        </div>
      )}
    </div>
  );
}
