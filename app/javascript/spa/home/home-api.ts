import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { readCsrfToken } from "../api/transactions";

const HomeMoneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
  formatted: z.string(),
});

export type HomeMoney = z.infer<typeof HomeMoneySchema>;

const HomeBalanceSheetAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  balance: HomeMoneySchema,
  /** Server-formatted weight of the account within its classification total, e.g. "42%" */
  weight: z.string(),
  logo_url: z.nullable(z.string()),
});

const HomeAccountGroupSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string(),
  /** Server-formatted weight within the classification, e.g. "42%" */
  weight: z.string(),
  total: HomeMoneySchema,
  accounts: z.array(HomeBalanceSheetAccountSchema),
});

const HomeClassificationGroupSchema = z.object({
  key: z.string(),
  name: z.string(),
  icon: z.string(),
  total: HomeMoneySchema,
  /** Server-formatted classification weight, e.g. "100%" */
  weight: z.string(),
  syncing: z.boolean(),
  account_groups: z.array(HomeAccountGroupSchema),
});

const HomeBalanceSheetSchema = z.object({
  classification_groups: z.array(HomeClassificationGroupSchema),
  always_expanded: z.array(z.string()),
});

const HomeNetWorthTrendSchema = z.object({
  current: HomeMoneySchema,
  change: HomeMoneySchema,
  percent: z.string(),
  color: z.string(),
  direction: z.string(),
});

const HomeNetWorthSchema = z.object({
  series: z.array(z.object({ date: z.string(), value: HomeMoneySchema })),
  trend: z.nullable(HomeNetWorthTrendSchema),
  comparison_label: z.nullable(z.string()),
  syncing: z.boolean(),
});

const HomeSankeyNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  filter_value: z.nullable(z.string()),
  value: z.number(),
  percentage: z.number(),
  color: z.nullable(z.string()),
});

const HomeSankeyLinkSchema = z.object({
  source: z.union([z.number(), z.string()]),
  target: z.union([z.number(), z.string()]),
  value: z.number(),
  color: z.nullable(z.string()),
  percentage: z.number(),
});

const HomeSankeySchema = z.object({
  nodes: z.array(HomeSankeyNodeSchema),
  links: z.array(HomeSankeyLinkSchema),
  currency_symbol: z.string(),
});

const HomeHoldingSchema = z.object({
  ticker: z.string(),
  name: z.nullable(z.string()),
  logo_url: z.nullable(z.string()),
  weight: z.union([z.number(), z.string()]),
  value: HomeMoneySchema,
  return_percent: z.nullable(z.string()),
  return_color: z.optional(z.nullable(z.string())),
  color: z.optional(z.nullable(z.string())),
});

const HomeInvestmentActivitySchema = z.object({
  label: z.string(),
  contributions: HomeMoneySchema,
  withdrawals: HomeMoneySchema,
  trades_count: z.number(),
});

const HomeInvestmentSummarySchema = z.object({
  present: z.boolean(),
  portfolio_value: z.optional(HomeMoneySchema),
  total_return: z.optional(
    z.nullable(
      z.object({
        value: HomeMoneySchema,
        percent: z.string(),
        percent_formatted: z.string(),
        color: z.string(),
      }),
    ),
  ),
  holdings: z.optional(z.array(HomeHoldingSchema)),
  activity: z.optional(z.nullable(HomeInvestmentActivitySchema)),
});

const HomeInsightFigureSchema = z.object({
  value: z.string(),
  caption: z.string(),
});

const HomeInsightSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  priority: z.string(),
  status: z.string(),
  generated_at: z.nullable(z.string()),
  icon_key: z.string(),
  icon_css_color: z.string(),
  sentiment: z.string(),
  key_figure: z.nullable(HomeInsightFigureSchema),
  acknowledge_path: z.string(),
});
const HomeInsightsSchema = z.object({
  enabled: z.boolean(),
  insights: z.array(HomeInsightSchema),
});

const HomeCashForecastEventSchema = z.object({
  date: z.string(),
  name: z.string(),
  amount: HomeMoneySchema,
  direction: z.enum(["inflow", "outflow"]),
});

const HomeCashForecastSchema = z.object({
  starting_balance: HomeMoneySchema,
  ending_balance: HomeMoneySchema,
  lowest: z.nullable(z.object({ date: z.string(), balance: HomeMoneySchema })),
  below_zero: z.boolean(),
  series: z.array(z.object({ date: z.string(), balance: HomeMoneySchema })),
  events: z.array(HomeCashForecastEventSchema),
});

const HomeResponseSchema = z.object({
  balance_sheet: HomeBalanceSheetSchema,
  net_worth: HomeNetWorthSchema,
  cashflow_sankey: HomeSankeySchema,
  cash_forecast: z.nullable(HomeCashForecastSchema),
  investment_summary: HomeInvestmentSummarySchema,
  insights: HomeInsightsSchema,
});

export type HomeBalanceSheet = z.infer<typeof HomeBalanceSheetSchema>;
export type HomeClassificationGroup = z.infer<typeof HomeClassificationGroupSchema>;
export type HomeAccountGroup = z.infer<typeof HomeAccountGroupSchema>;
export type HomeNetWorth = z.infer<typeof HomeNetWorthSchema>;
export type HomeSankey = z.infer<typeof HomeSankeySchema>;
export type HomeSankeyNode = z.infer<typeof HomeSankeyNodeSchema>;
export type HomeSankeyLink = z.infer<typeof HomeSankeyLinkSchema>;

export type HomePeriodInput = {
  period?: string;
  startDate?: string;
  endDate?: string;
};

/**
 * Home dashboard endpoint URL for a period selection. The query string is
 * part of the URL so react-query keys (and server responses) vary by period.
 */
export function homePathForPeriod(homePath: string, period: HomePeriodInput): string {
  const params = new URLSearchParams();
  if (period.startDate !== undefined && period.endDate !== undefined) {
    params.set("start_date", period.startDate);
    params.set("end_date", period.endDate);
  } else if (period.period !== undefined) params.set("period", period.period);
  const query = params.toString();
  return query === "" ? homePath : `${homePath}?${query}`;
}

export type HomeInvestmentSummary = z.infer<typeof HomeInvestmentSummarySchema>;
export type HomeInsight = z.infer<typeof HomeInsightSchema>;
export type HomeCashForecast = z.infer<typeof HomeCashForecastSchema>;

export class HomeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestHome(path: string, signal?: AbortSignal) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new HomeApiError(`Home request failed (${response.status})`, response.status);
  return HomeResponseSchema.parse(payload);
}

export function homeWidgetsQueryOptions(path: string) {
  return {
    queryKey: ["spa", "home-widgets", path] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) => requestHome(path, signal),
    staleTime: 30_000,
  };
}

export function useHomeWidgetsQuery(path: string) {
  return useQuery({
    ...homeWidgetsQueryOptions(path),
    retry: (failureCount, error) =>
      !(error instanceof HomeApiError && error.status < 500) && failureCount < 2,
  });
}

export async function acknowledgeHomeInsight(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-CSRF-Token": readCsrfToken() },
  });
  if (!response.ok)
    throw new HomeApiError(`Acknowledge failed (${response.status})`, response.status);
}
