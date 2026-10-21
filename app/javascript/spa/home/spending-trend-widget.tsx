import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { useSpaPaths } from "../api/paths";
import { Icon } from "../icon";
import { HomeApiError } from "./home-api";

const HomeMoneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
  formatted: z.string(),
});

const SpendingPointSchema = z.object({
  day: z.number(),
  value: z.number(),
  date: z.string(),
  date_formatted: z.string(),
});

const SpendingTrendSchema = z.object({
  month: z.string(),
  month_label: z.string(),
  period: z.object({
    start_date: z.string(),
    end_date: z.string(),
    date_range_label: z.string(),
  }),
  previous_period: z.object({
    start_date: z.string(),
    end_date: z.string(),
  }),
  days: z.number(),
  current_days: z.number(),
  axis_labels: z.array(z.string()),
  current: z.array(SpendingPointSchema),
  previous: z.array(SpendingPointSchema),
  current_total: HomeMoneySchema,
  previous_total: HomeMoneySchema,
  delta: HomeMoneySchema,
  delta_tone: z.enum(["up", "down", "flat"]),
  previous_label: z.string(),
  previous_comparison_day: z.nullable(z.number()),
  date_range_short: z.string(),
});

export type SpendingTrendData = z.infer<typeof SpendingTrendSchema>;
export type SpendingTrendPoint = z.infer<typeof SpendingPointSchema>;

const SpendingTrendEnvelopeSchema = z.object({ spending_trend: SpendingTrendSchema });

function extractSpendingTrend(payload: unknown): SpendingTrendData {
  const envelope = SpendingTrendEnvelopeSchema.safeParse(payload);
  if (envelope.success) return envelope.data.spending_trend;
  return SpendingTrendSchema.parse(payload);
}

function spendingTrendQueryOptions(basePath: string, month: string | undefined) {
  const params = new URLSearchParams();
  if (month !== undefined && month.length > 0) params.set("spending_month", month);
  const query = params.toString();
  const path = query.length > 0 ? `${basePath}?${query}` : basePath;
  return {
    queryKey: ["spa", "home", "spending-trend", path] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<SpendingTrendData> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new HomeApiError(
          `Spending trend request failed (${response.status})`,
          response.status,
        );
      }
      return extractSpendingTrend(payload);
    },
    staleTime: 30_000,
  };
}

export type SpendingTrendText = {
  selectMonth: string;
  scopeHint: string;
  noData: string;
  loading: string;
  loadError: string;
};

const DEFAULT_TEXT: SpendingTrendText = {
  selectMonth: "Select month",
  scopeHint:
    "Shows the month you pick here — independent of the dashboard's time period at the top.",
  noData: "No spending data for this month",
  loading: "Loading…",
  loadError: "Spending could not be loaded.",
};

function lastTwelveMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  return out;
}

function formatTickCompact(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

function formatTooltipMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return String(value);
  }
}

function SpendingTrendChart({
  data,
  currency,
  currentLabel,
  previousLabel,
}: {
  data: SpendingTrendData;
  currency: string;
  currentLabel: string;
  previousLabel: string;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const width = 1000;
  const height = 208;
  const margin = { top: 8, right: 52, bottom: 24, left: 4 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const { current, previous, days, axis_labels: axisLabels } = data;

  const maxValue = useMemo(
    () => Math.max(0, ...current.map((p) => p.value), ...previous.map((p) => p.value)),
    [current, previous],
  );
  const top = maxValue * 1.05;

  const ticks = useMemo(() => {
    const target = top / 4;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, target)));
    const ratio = target / magnitude;
    const step = magnitude * (ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1);
    const out: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v));
    return out.length > 0 ? out : [0];
  }, [top]);

  const tickDays = useMemo(() => {
    const span =
      typeof window !== "undefined" && window.innerWidth < 640
        ? Math.min(days, data.current_days)
        : days;
    return [...new Set([1, Math.round((1 + span) / 2), span])];
  }, [days, data]);

  const currentByDay = useMemo(() => new Map(current.map((p) => [p.day, p])), [current]);
  const previousByDay = useMemo(() => new Map(previous.map((p) => [p.day, p])), [previous]);

  if (maxValue <= 0) return null;

  const pointX = (day: number) => margin.left + ((day - 1) / Math.max(1, days - 1)) * innerWidth;
  const pointY = (value: number) => margin.top + innerHeight - (value / top) * innerHeight;

  const linePath = (points: SpendingTrendPoint[]) =>
    points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${pointX(p.day).toFixed(1)},${pointY(p.value).toFixed(1)}`,
      )
      .join(" ");

  const hoveredCurrent = hoverDay === null ? undefined : currentByDay.get(hoverDay);
  const hoveredPrevious = hoverDay === null ? undefined : previousByDay.get(hoverDay);
  const hoveredLabel = hoveredCurrent ?? hoveredPrevious;
  const currentEndpoint = current.at(-1);
  const tooltipX = hoverDay === null ? 0 : pointX(hoverDay);

  return (
    <div className="relative w-full">
      <div
        onMouseLeave={() => {
          setHoverDay(null);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * width - margin.left;
          const dayFloat = 1 + (px / innerWidth) * (days - 1);
          setHoverDay(Math.max(1, Math.min(days, Math.round(dayFloat))));
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-52 w-full"
          aria-label="Cumulative spending chart"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={margin.left + innerWidth}
                y1={pointY(tick)}
                y2={pointY(tick)}
                stroke="var(--color-gray-300)"
                strokeDasharray="4, 4"
                strokeOpacity={0.6}
              />
              <text
                x={margin.left + innerWidth + 8}
                y={pointY(tick) + 4}
                fontSize={12}
                fill="var(--color-secondary)"
              >
                {formatTickCompact(tick, currency)}
              </text>
            </g>
          ))}
          {tickDays.map((day) => (
            <text
              key={day}
              x={pointX(day)}
              y={height - 6}
              textAnchor={day === 1 ? "start" : day === days ? "end" : "middle"}
              fontSize={12}
              fill="var(--color-secondary)"
            >
              {axisLabels[day - 1] ?? String(day)}
            </text>
          ))}
          {previous.length > 0 ? (
            <path
              d={linePath(previous)}
              fill="none"
              stroke="var(--color-gray-400)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {current.length > 0 ? (
            <path
              d={linePath(current)}
              fill="none"
              stroke="var(--color-success)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {currentEndpoint !== undefined ? (
            <circle
              cx={pointX(currentEndpoint.day)}
              cy={pointY(currentEndpoint.value)}
              r={3.5}
              fill="var(--color-success)"
            />
          ) : null}
          {hoverDay !== null ? (
            <line
              x1={tooltipX}
              x2={tooltipX}
              y1={margin.top}
              y2={margin.top + innerHeight}
              stroke="currentColor"
              strokeDasharray="4, 4"
              className="text-subdued"
            />
          ) : null}
          {hoveredCurrent !== undefined && hoverDay !== null ? (
            <circle
              cx={tooltipX}
              cy={pointY(hoveredCurrent.value)}
              r={4}
              fill="var(--color-success)"
              pointerEvents="none"
            />
          ) : null}
          {hoveredPrevious !== undefined && hoverDay !== null ? (
            <circle
              cx={tooltipX}
              cy={pointY(hoveredPrevious.value)}
              r={4}
              fill="var(--color-gray-400)"
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </div>
      {hoverDay !== null && hoveredLabel !== undefined ? (
        <div className="pointer-events-none absolute z-20 rounded-lg border border-primary bg-container p-3 text-xs shadow-md">
          <div className="mb-1 text-xs text-secondary">{hoveredLabel.date_formatted}</div>
          <div className="space-y-1">
            {hoveredCurrent !== undefined ? (
              <div className="flex items-center gap-1.5 font-medium tabular-nums text-primary">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: "var(--color-success)" }}
                />
                {currentLabel}: {formatTooltipMoney(hoveredCurrent.value, currency)}
              </div>
            ) : null}
            {hoveredPrevious !== undefined ? (
              <div className="flex items-center gap-1.5 font-medium tabular-nums text-primary">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: "var(--color-gray-400)" }}
                />
                {previousLabel}: {formatTooltipMoney(hoveredPrevious.value, currency)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SpendingTrendWidget({
  month,
  onMonthChange,
  homePath,
  text = DEFAULT_TEXT,
}: {
  month?: string;
  onMonthChange: (iso: string) => void;
  homePath: string;
  text?: SpendingTrendText;
}) {
  const paths = useSpaPaths();
  const resolvedPath = homePath.length > 0 ? homePath : paths.apiPaths.home;
  const query = useQuery({
    ...spendingTrendQueryOptions(resolvedPath, month),
    retry: (failureCount, error) =>
      !(error instanceof HomeApiError && error.status < 500) && failureCount < 2,
  });
  const data = query.data;

  const monthOptions = useMemo(() => lastTwelveMonths(), []);
  const selectedMonth = month ?? data?.month ?? monthOptions[0];
  const hasData =
    data !== undefined &&
    (data.current.some((p) => p.value > 0) || data.previous.some((p) => p.value > 0));

  const deltaClass =
    data?.delta_tone === "down"
      ? "text-success"
      : data?.delta_tone === "flat"
        ? "text-secondary"
        : "text-destructive";

  return (
    <div id="spending-trend-section" className="space-y-4 px-4">
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-sm text-secondary sm:block">
          {query.isLoading ? text.loading : (data?.period.date_range_label ?? "")}
        </p>
        <p className="text-sm text-secondary sm:hidden">
          {query.isLoading ? text.loading : (data?.date_range_short ?? "")}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-secondary" title={text.scopeHint}>
            ⓘ
          </span>
          <Menu as="div" className="relative">
            <MenuButton
              type="button"
              aria-label={text.selectMonth}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-secondary bg-container py-2 pr-2 pl-3 text-sm font-medium whitespace-nowrap text-primary hover:bg-container-inset-hover focus:outline-hidden"
            >
              <span className="capitalize">{data?.month_label ?? selectedMonth}</span>
              <Icon name="chevron-down" size="sm" />
            </MenuButton>
            <MenuItems className="shadow-border-lg absolute right-0 z-30 mt-2 max-h-72 min-w-52 overflow-y-auto rounded-lg bg-container py-1 focus:outline-none">
              {monthOptions.map((option) => (
                <MenuItem key={option} as="div">
                  <button
                    type="button"
                    onClick={() => {
                      onMonthChange(option);
                    }}
                    aria-current={selectedMonth === option ? "true" : undefined}
                    className="block w-full px-4 py-2 text-left text-sm capitalize hover:bg-container-hover"
                  >
                    {option}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        </div>
      </div>

      {query.isError ? (
        <p className="text-sm text-destructive">{text.loadError}</p>
      ) : data !== undefined ? (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-10 w-1 shrink-0 rounded-full bg-success" />
              <div className="min-w-0">
                <p className="truncate text-sm text-primary capitalize">{data.month_label}</p>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-medium whitespace-nowrap tabular-nums text-primary privacy-sensitive">
                    {data.current_total.formatted}
                  </span>
                  <span
                    className={`text-sm whitespace-nowrap tabular-nums privacy-sensitive ${deltaClass}`}
                  >
                    {data.delta.formatted}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-10 w-1 shrink-0 rounded-full bg-subdued" />
              <div className="min-w-0">
                <p className="truncate text-sm text-secondary">
                  <span className="capitalize">{data.previous_label}</span>
                  {data.previous_comparison_day !== null ? (
                    <span className="text-xs"> (1-{data.previous_comparison_day})</span>
                  ) : null}
                </p>
                <p className="text-lg font-medium whitespace-nowrap tabular-nums text-secondary privacy-sensitive">
                  {data.previous_total.formatted}
                </p>
              </div>
            </div>
          </div>
          {hasData ? (
            <div className="privacy-sensitive min-h-52 w-full">
              <SpendingTrendChart
                data={data}
                currency={data.current_total.currency}
                currentLabel={data.month_label}
                previousLabel={data.previous_label}
              />
            </div>
          ) : (
            <div className="flex h-52 w-full items-center justify-center">
              <p className="text-sm text-secondary">{text.noData}</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
