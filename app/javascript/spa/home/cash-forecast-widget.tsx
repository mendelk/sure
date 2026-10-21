// Cash forecast widget: starting cash on hand plus every projected recurring
// inflow/outflow over the next 30 days that touches a cash (Depository)
// account. The server computes daily balances and per-day events; money
// renders verbatim from the server `formatted` strings. Self-contained SVG
// line chart (no chart deps): daily balance line, zero floor when the
// forecast dips below zero, lowest-point marker, and a hover crosshair with
// the day's balance plus that day's events.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icon";
import type { HomeCashForecast } from "./home-api";

export type CashForecastText = {
  starting: string;
  ending: string;
  low: string;
  belowZero: string;
  noActivity: string;
  upcoming: string;
};

const DEFAULT_TEXT: CashForecastText = {
  starting: "Starting balance",
  ending: "In 30 days",
  low: "Projected low",
  belowZero: "Projected to dip below zero in the next 30 days",
  noActivity: "No upcoming recurring activity",
  upcoming: "Upcoming",
};

export function resolveCashForecastText(
  homeText: Record<string, string | undefined>,
): CashForecastText {
  return {
    starting: homeText.cash_forecast_starting ?? DEFAULT_TEXT.starting,
    ending: homeText.cash_forecast_ending ?? DEFAULT_TEXT.ending,
    low: homeText.cash_forecast_low ?? DEFAULT_TEXT.low,
    belowZero: homeText.cash_forecast_below_zero ?? DEFAULT_TEXT.belowZero,
    noActivity: homeText.cash_forecast_no_activity ?? DEFAULT_TEXT.noActivity,
    upcoming: homeText.cash_forecast_upcoming ?? DEFAULT_TEXT.upcoming,
  };
}

type CashForecastEvent = HomeCashForecast["events"][number];

type PlotPoint = {
  date: string;
  label: string;
  value: number;
  formatted: string;
};

function useDayFormatter(): (date: string) => string {
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
    () => (date: string) => formatter.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)),
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const formatDay = useDayFormatter();

  useEffect(() => {
    // eslint-disable-next-line no-empty-function -- No-op cleanup keeps a single return path when ResizeObserver is unavailable.
    if (typeof ResizeObserver === "undefined" || containerRef.current === null) return () => {};
    const target = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(0);
      if (entry !== undefined) setMeasuredWidth(entry.contentRect.width);
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);

  const currency = forecast.starting_balance.currency;
  const tickFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      });
    } catch {
      return null;
    }
  }, [currency]);

  const points: PlotPoint[] = useMemo(
    () =>
      forecast.series.map((point) => ({
        date: point.date,
        label: formatDay(point.date),
        value: Number(point.balance.amount),
        formatted: point.balance.formatted,
      })),
    [forecast.series, formatDay],
  );

  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CashForecastEvent[]> = {};
    for (const event of forecast.events) {
      const key = event.date.slice(0, 10);
      grouped[key] = [...(grouped[key] ?? []), event];
    }
    return grouped;
  }, [forecast.events]);

  if (points.length === 0) return <p className="px-4 text-sm text-secondary">{text.noActivity}</p>;

  return (
    <CashForecastPlot
      containerRef={containerRef}
      currency={currency}
      eventsByDate={eventsByDate}
      forecast={forecast}
      hoverIndex={hoverIndex}
      measuredWidth={measuredWidth}
      onHover={setHoverIndex}
      points={points}
      text={text}
      tickFormatter={tickFormatter}
    />
  );
}

function CashForecastPlot({
  containerRef,
  currency,
  eventsByDate,
  forecast,
  hoverIndex,
  measuredWidth,
  onHover,
  points,
  text,
  tickFormatter,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  currency: string;
  eventsByDate: Record<string, CashForecastEvent[]>;
  forecast: HomeCashForecast;
  hoverIndex: number | null;
  measuredWidth: number;
  onHover: (index: number | null) => void;
  points: PlotPoint[];
  text: CashForecastText;
  tickFormatter: Intl.NumberFormat | null;
}) {
  const width = Math.max(measuredWidth, 320);
  const height = 208;
  const margin = { top: 12, right: 12, bottom: 24, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const values = points.map((point) => point.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : Math.max(Math.abs(hi) * 0.1, 1);
  // The zero floor is only meaningful when the forecast actually dips below
  // zero; otherwise the domain hugs the projected range.
  const dipsNegative = forecast.below_zero || lo < 0;
  const domainLo = dipsNegative ? Math.min(lo - pad, 0) : lo - pad;
  const domainHi = hi + pad;

  const pointX = (index: number) =>
    points.length === 1
      ? margin.left + innerWidth / 2
      : margin.left + (index / (points.length - 1)) * innerWidth;
  const pointY = (value: number) =>
    margin.top + innerHeight - ((value - domainLo) / (domainHi - domainLo)) * innerHeight;

  const ticks = [0, 1, 2, 3].map((i) => domainLo + ((domainHi - domainLo) * i) / 3);
  const formatTick = (value: number) =>
    tickFormatter === null ? String(Math.round(value)) : tickFormatter.format(value);

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${pointX(index).toFixed(1)},${pointY(point.value).toFixed(1)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${pointX(points.length - 1).toFixed(1)},${(margin.top + innerHeight).toFixed(1)} L${pointX(0).toFixed(1)},${(margin.top + innerHeight).toFixed(1)} Z`;

  let lowIndex = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] < values[lowIndex]) lowIndex = i;

  const lastIndex = points.length - 1;
  const tickDays = [...new Set([0, Math.floor(lastIndex / 2), lastIndex])];
  const zeroY = forecast.below_zero ? pointY(0) : null;

  const hovered = hoverIndex === null ? undefined : points[hoverIndex];
  const hoveredEvents =
    hovered === undefined ? [] : (eventsByDate[hovered.date.slice(0, 10)] ?? []);
  const tooltipX = hoverIndex === null ? 0 : pointX(hoverIndex);
  const tooltipAlign =
    hoverIndex !== null && hoverIndex < points.length * 0.25
      ? "left"
      : hoverIndex !== null && hoverIndex > points.length * 0.75
        ? "right"
        : "center";

  return (
    <div className="relative w-full">
      <div
        onMouseLeave={() => {
          onHover(null);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * width - margin.left;
          const raw = points.length === 1 ? 0 : (px / innerWidth) * lastIndex;
          onHover(Math.max(0, Math.min(lastIndex, Math.round(raw))));
        }}
        ref={containerRef}
      >
        <svg
          aria-label={`${text.starting}: ${forecast.starting_balance.formatted}, ${text.ending}: ${forecast.ending_balance.formatted}`}
          className="h-52 w-full"
          viewBox={`0 0 ${width} ${height}`}
        >
          {ticks.map((tick) => (
            <g key={`forecast-tick-${tick}`}>
              <line
                stroke="var(--color-gray-300)"
                strokeDasharray="4, 4"
                strokeOpacity={0.6}
                x1={margin.left}
                x2={margin.left + innerWidth}
                y1={pointY(tick)}
                y2={pointY(tick)}
              />
              <text
                fill="var(--color-secondary)"
                fontSize={12}
                textAnchor="end"
                x={margin.left - 8}
                y={pointY(tick) + 4}
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {zeroY !== null ? (
            <g>
              <line
                stroke="var(--color-destructive)"
                strokeDasharray="4, 4"
                x1={margin.left}
                x2={margin.left + innerWidth}
                y1={zeroY}
                y2={zeroY}
              />
              <text
                fill="var(--color-destructive)"
                fontSize={12}
                textAnchor="end"
                x={margin.left - 8}
                y={zeroY + 4}
              >
                {formatTick(0)}
              </text>
            </g>
          ) : null}
          {tickDays.map((day) => (
            <text
              fill="var(--color-secondary)"
              fontSize={12}
              key={`forecast-day-${day}-${points[day].date}`}
              textAnchor={day === 0 ? "start" : day === lastIndex ? "end" : "middle"}
              x={pointX(day)}
              y={height - 6}
            >
              {points[day].label}
            </text>
          ))}
          <path d={areaPath} fill="var(--color-info)" fillOpacity={0.12} />
          <circle
            cx={pointX(lowIndex)}
            cy={pointY(values[lowIndex])}
            fill="var(--color-warning)"
            r={4}
          />
          <circle
            cx={pointX(lastIndex)}
            cy={pointY(values[lastIndex])}
            fill="var(--color-info)"
            r={3.5}
          />
          {hoverIndex !== null ? (
            <line
              className="text-subdued"
              stroke="currentColor"
              strokeDasharray="4, 4"
              x1={tooltipX}
              x2={tooltipX}
              y1={margin.top}
              y2={margin.top + innerHeight}
            />
          ) : null}
          {hovered !== undefined && hoverIndex !== null ? (
            <circle
              cx={tooltipX}
              cy={pointY(hovered.value)}
              fill="var(--color-info)"
              pointerEvents="none"
              r={4}
            />
          ) : null}
        </svg>
      </div>
      {hovered !== undefined && hoverIndex !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-20 max-w-64 rounded-lg border border-primary bg-container p-3 text-xs shadow-md"
          style={
            tooltipAlign === "center"
              ? { left: `${(tooltipX / width) * 100}%`, transform: "translateX(-50%)" }
              : tooltipAlign === "left"
                ? { left: 0 }
                : { right: 0 }
          }
        >
          <div className="mb-1 text-xs text-secondary">{hovered.label}</div>
          <div className="mb-1 text-sm font-medium tabular-nums text-primary privacy-sensitive">
            {hovered.formatted}
          </div>
          {hoveredEvents.length > 0 ? (
            <div className="space-y-1">
              <ul className="space-y-1">
                {hoveredEvents.map((event) => (
                  <li
                    className="flex items-center gap-1.5 font-medium tabular-nums text-primary"
                    key={`forecast-event-${event.date}-${event.name}-${event.amount.amount}-${event.direction}`}
                  >
                    <span
                      className={`inline-block size-2 shrink-0 rounded-full ${event.direction === "inflow" ? "bg-success" : "bg-destructive"}`}
                    />
                    <span className="min-w-0 flex-1 truncate font-normal">{event.name}</span>
                    <span className="privacy-sensitive">{event.amount.formatted}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only">
        {currency} {text.upcoming}: {hoveredEvents.length}
      </span>
    </div>
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

  return (
    <div id="cash-forecast-section" className="space-y-4 px-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-secondary">{text.starting}</p>
          <p className="privacy-sensitive text-lg font-medium whitespace-nowrap tabular-nums text-primary">
            {forecast.starting_balance.formatted}
          </p>
        </div>
        <div>
          <p className="text-sm text-secondary">{text.ending}</p>
          <p
            className={`privacy-sensitive text-lg font-medium whitespace-nowrap tabular-nums ${deltaClass}`}
          >
            {forecast.ending_balance.formatted}
          </p>
        </div>
        {forecast.lowest !== null ? (
          <div>
            <p className="text-sm text-secondary">
              {text.low} · {formatDay(forecast.lowest.date)}
            </p>
            <p className="privacy-sensitive text-lg font-medium whitespace-nowrap tabular-nums text-primary">
              {forecast.lowest.balance.formatted}
            </p>
          </div>
        ) : null}
      </div>
      {forecast.below_zero ? (
        <p
          className="flex items-center gap-2 rounded-lg border border-primary bg-container-inset px-3 py-2 text-sm font-medium text-destructive"
          role="alert"
        >
          <Icon name="alert-triangle" size="sm" />
          {text.belowZero}
        </p>
      ) : null}
      <div className="privacy-sensitive min-h-52 w-full">
        <CashForecastChart forecast={forecast} text={text} />
      </div>
    </div>
  );
}
