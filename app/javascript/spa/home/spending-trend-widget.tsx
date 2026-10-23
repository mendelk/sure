import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { Chart } from "@tanstack/charts/react";
import { spendingDefinition } from "../../charts/comparison";
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
  chartLabel: string;
  chartInstructions: string;
};

const DEFAULT_TEXT: SpendingTrendText = {
  selectMonth: "Select month",
  scopeHint:
    "Shows the month you pick here — independent of the dashboard's time period at the top.",
  noData: "No spending data for this month",
  loading: "Loading…",
  loadError: "Spending could not be loaded.",
  chartLabel: "Cumulative spending comparison",
  chartInstructions: "Use the left and right arrow keys to compare values.",
};

export function resolveSpendingTrendText(
  homeText: Record<string, string | undefined>,
): SpendingTrendText {
  return {
    ...DEFAULT_TEXT,
    chartLabel: homeText.spending_trend_chart_label ?? DEFAULT_TEXT.chartLabel,
    chartInstructions: homeText.spending_trend_chart_instructions ?? DEFAULT_TEXT.chartInstructions,
  };
}

function lastTwelveMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  return out;
}

function SpendingTrendChart({ data, text }: { data: SpendingTrendData; text: SpendingTrendText }) {
  const definition = useMemo(
    () =>
      spendingDefinition(data, {
        currency: data.current_total.currency,
        locale: document.documentElement.lang || undefined,
        currentLabel: data.month_label,
        previousLabel: data.previous_label,
      }),
    [data],
  );

  return (
    <Chart
      definition={definition}
      height={208}
      className="w-full"
      ariaLabel={text.chartLabel}
      ariaDescription={text.chartInstructions}
      tabIndex={0}
    />
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
              <SpendingTrendChart data={data} text={text} />
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
