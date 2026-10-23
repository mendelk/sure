// Cash forecast widget: starting checking balance plus recurring checking
// activity and unpaid dynamic card statements over the next 30 days.
// The server owns balances and dated events. TanStack owns scales, responsive
// layout, and pointer/keyboard focus; displayed money stays server-formatted.
import { useMemo } from "react";
import {
  areaY,
  crosshair,
  defineChart,
  dot,
  lineY,
  ruleY,
  type ChartTooltipInput,
} from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Alert } from "../components/alert";
import type { HomeCashForecast } from "./home-api";

export type CashForecastText = {
  title: string;
  balance: string;
  instructions: string;
  starting: string;
  ending: string;
  low: string;
  firstNegative: string;
  belowZero: string;
  noActivity: string;
};

const DEFAULT_TEXT: CashForecastText = {
  title: "Cash Forecast",
  balance: "Projected balance",
  instructions:
    "Use the left and right arrow keys to explore daily balances and scheduled activity.",
  starting: "Starting balance",
  ending: "In 30 days",
  low: "Projected low",
  firstNegative: "First negative balance",
  belowZero: "Projected to dip below zero in the next 30 days",
  noActivity: "No upcoming recurring activity",
};

export function resolveCashForecastText(
  homeText: Record<string, string | undefined>,
): CashForecastText {
  return {
    title: homeText.cash_forecast_title ?? DEFAULT_TEXT.title,
    balance: homeText.cash_forecast_balance ?? DEFAULT_TEXT.balance,
    instructions: homeText.cash_forecast_instructions ?? DEFAULT_TEXT.instructions,
    starting: homeText.cash_forecast_starting ?? DEFAULT_TEXT.starting,
    ending: homeText.cash_forecast_ending ?? DEFAULT_TEXT.ending,
    low: homeText.cash_forecast_low ?? DEFAULT_TEXT.low,
    firstNegative: homeText.cash_forecast_first_negative ?? DEFAULT_TEXT.firstNegative,
    belowZero: homeText.cash_forecast_below_zero ?? DEFAULT_TEXT.belowZero,
    noActivity: homeText.cash_forecast_no_activity ?? DEFAULT_TEXT.noActivity,
  };
}

type CashForecastEvent = HomeCashForecast["events"][number];

type PlotPoint = {
  date: string;
  timestamp: number;
  value: number;
  formatted: string;
  events: CashForecastEvent[];
};

function useDayFormatter(): (date: string | number) => string {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [],
  );
  return useMemo(
    () => (date: string | number) =>
      formatter.format(
        typeof date === "number" ? date : Date.parse(`${date.slice(0, 10)}T00:00:00Z`),
      ),
    [formatter],
  );
}

function CashForecastChart({
  forecast,
  text,
}: {
  forecast: HomeCashForecast;
  text: CashForecastText;
}) {
  const points = useMemo(() => {
    const eventsByDate = new Map<string, CashForecastEvent[]>();
    for (const event of forecast.events) {
      const date = event.date.slice(0, 10);
      const events = eventsByDate.get(date);
      if (events === undefined) eventsByDate.set(date, [event]);
      else events.push(event);
    }
    return forecast.series.map((point) => ({
      date: point.date,
      timestamp: Date.parse(`${point.date.slice(0, 10)}T00:00:00Z`),
      value: Number(point.balance.amount),
      formatted: point.balance.formatted,
      events: eventsByDate.get(point.date.slice(0, 10)) ?? [],
    }));
  }, [forecast.series, forecast.events]);

  if (points.length === 0) return <p className="text-sm text-secondary">{text.noActivity}</p>;

  return <CashForecastPlot forecast={forecast} points={points} text={text} />;
}

function CashForecastPlot({
  forecast,
  points,
  text,
}: {
  forecast: HomeCashForecast;
  points: PlotPoint[];
  text: CashForecastText;
}) {
  const formatDay = useDayFormatter();
  const currency = forecast.starting_balance.currency;
  const tickFormatter = useMemo(
    () =>
      new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [currency],
  );
  const definition = useMemo(() => {
    const first = points[0];
    const last = points.at(-1)!;
    const values = points.map((point) => point.value);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const padding = (maximum - minimum) * 0.08 || 1;
    const lowest = points.filter((point) => point.date === forecast.lowest?.date);
    const firstNegative = points.find((point) => point.value < 0);
    const tickDates = points
      .filter((_, index) => index % 7 === 0 || index === points.length - 1)
      .map((point) => point.timestamp);
    // A singleton still needs a nonzero temporal domain.
    const halfDay = points.length === 1 ? 43_200_000 : 0;
    const tooltipOptions: ChartTooltipInput<PlotPoint, number, number, "dom"> = {
      use: tooltip,
      sticky: false,
      className: "rounded-lg border border-primary bg-container p-3 text-xs text-primary shadow-md",
      content: (focused) => {
        const point = focused[0].datum;
        let title = formatDay(point.timestamp);
        if (point.date === firstNegative?.date) title += ` · ${text.firstNegative}`;
        if (point.date === forecast.lowest?.date) title += ` · ${text.low}`;
        return {
          title,
          rows: [
            { label: text.balance, value: point.formatted },
            ...point.events.map((event) => ({
              label: event.name,
              value: `${event.direction === "inflow" ? "+" : "−"}${event.amount.formatted}`,
              color:
                event.direction === "inflow" ? "var(--color-success)" : "var(--color-destructive)",
            })),
          ],
        };
      },
    };

    return defineChart({
      theme: {
        foreground: "var(--utility-text-primary)",
        muted: "var(--utility-text-secondary)",
        grid: "var(--utility-border-primary)",
        background: "transparent",
        focusRing: false,
      },
      scales: {
        x: {
          scale: scaleLinear([first.timestamp - halfDay, last.timestamp + halfDay], [0, 1]),
          axis: {
            ticks: { values: tickDates, format: formatDay },
            tickLabels: { thin: { minGap: 16, priority: "ends" } },
          },
        },
        y: {
          scale: scaleLinear([minimum < 0 ? minimum - padding : 0, maximum + padding], [0, 1]),
          nice: true,
          grid: true,
          axis: { ticks: { count: 4, format: (value: number) => tickFormatter.format(value) } },
        },
      },
      marks: [
        decorative(
          areaY(points, {
            x: "timestamp",
            y1: 0,
            y2: "value",
            fill: "var(--color-info)",
            fillOpacity: 0.1,
          }),
        ),
        decorative(
          ruleY([first], {
            y: () => 0,
            stroke: forecast.below_zero
              ? "var(--color-destructive)"
              : "var(--utility-border-primary)",
            strokeDasharray: "4 4",
          }),
        ),
        lineY(points, {
          x: "timestamp",
          y: "value",
          stroke: "var(--color-info)",
          strokeWidth: 2.5,
        }),
        decorative(dot([last], { x: "timestamp", y: "value", fill: "var(--color-info)", r: 3.5 })),
        decorative(
          dot(firstNegative === undefined ? [] : [firstNegative], {
            x: "timestamp",
            y: "value",
            fill: "var(--color-warning)",
            r: 6,
          }),
        ),
        decorative(
          dot(lowest, {
            x: "timestamp",
            y: "value",
            fill: "var(--color-destructive)",
            r: 5,
          }),
        ),
        crosshair({
          x: { stroke: "var(--utility-text-subdued)", strokeDasharray: "4 4" },
          y: false,
          marker: { radius: 4, fill: "var(--color-info)", stroke: "var(--color-container)" },
        }),
      ],
      focus: "group-x",
      maxFocusDistance: Infinity,
      tooltip: tooltipOptions,
    });
  }, [
    points,
    forecast.lowest,
    forecast.below_zero,
    formatDay,
    tickFormatter,
    text.balance,
    text.firstNegative,
    text.low,
  ]);

  return (
    <Chart
      ariaDescription={text.instructions}
      ariaLabel={`${text.title}. ${text.starting}: ${forecast.starting_balance.formatted}. ${text.ending}: ${forecast.ending_balance.formatted}.`}
      definition={definition}
      height={256}
    />
  );
}

export function CashForecastWidget({
  forecast,
  text = DEFAULT_TEXT,
}: {
  forecast: HomeCashForecast | null | undefined;
  text?: CashForecastText;
}) {
  const formatDay = useDayFormatter();

  if (forecast === null || forecast === undefined) {
    return (
      <div className="px-4">
        <p className="text-sm text-secondary">{text.noActivity}</p>
      </div>
    );
  }

  const delta = Number(forecast.ending_balance.amount) - Number(forecast.starting_balance.amount);
  const deltaClass = delta < 0 ? "text-destructive" : delta > 0 ? "text-success" : "text-secondary";
  const first = forecast.series.at(0);
  const last = forecast.series.at(-1);

  return (
    <div id="cash-forecast-section" className="space-y-4 px-4">
      <dl className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm text-secondary">{text.starting}</dt>
          <dd className="privacy-sensitive text-lg font-medium tabular-nums text-primary">
            {forecast.starting_balance.formatted}
          </dd>
          {first !== undefined ? (
            <dd className="text-xs text-secondary">{formatDay(first.date)}</dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-secondary">{text.ending}</dt>
          <dd className={`privacy-sensitive text-lg font-medium tabular-nums ${deltaClass}`}>
            {forecast.ending_balance.formatted}
          </dd>
          {last !== undefined ? (
            <dd className="text-xs text-secondary">{formatDay(last.date)}</dd>
          ) : null}
        </div>
        {forecast.lowest !== null ? (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-sm text-secondary">{text.low}</dt>
            <dd
              className={`privacy-sensitive text-lg font-medium tabular-nums ${Number(forecast.lowest.balance.amount) < 0 ? "text-destructive" : "text-primary"}`}
            >
              {forecast.lowest.balance.formatted}
            </dd>
            <dd className="text-xs text-secondary">{formatDay(forecast.lowest.date)}</dd>
          </div>
        ) : null}
      </dl>
      {forecast.below_zero ? (
        <Alert live="alert" variant="warning">
          {text.belowZero}
        </Alert>
      ) : null}
      <div className="privacy-sensitive min-h-64 w-full text-primary">
        <CashForecastChart forecast={forecast} text={text} />
      </div>
    </div>
  );
}
