export type HomePeriod = {
  period?: string;
  startDate?: string;
  endDate?: string;
};

export type HomeSearch = {
  period?: string;
  start_date?: string;
  end_date?: string;
  money_flow_month?: string;
  money_flow_account_ids?: string[];
  spending_month?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dateValue(value: unknown): string | undefined {
  const text = stringValue(value);
  return text !== undefined && DATE_PATTERN.test(text) ? text : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

export function validateHomeSearch(input: Record<string, unknown>): HomeSearch {
  const result: HomeSearch = {};
  const period = stringValue(input.period);
  if (period !== undefined) result.period = period;
  const startDate = dateValue(input.start_date);
  if (startDate !== undefined) result.start_date = startDate;
  const endDate = dateValue(input.end_date);
  if (endDate !== undefined) result.end_date = endDate;
  const moneyFlowMonth = dateValue(input.money_flow_month);
  if (moneyFlowMonth !== undefined) result.money_flow_month = moneyFlowMonth;
  const accountIds = stringArray(input.money_flow_account_ids);
  if (accountIds.length > 0) result.money_flow_account_ids = accountIds;
  const spendingMonth = dateValue(input.spending_month);
  if (spendingMonth !== undefined) result.spending_month = spendingMonth;
  return result;
}

export function homePeriodFromSearch(search: HomeSearch): HomePeriod {
  return {
    ...(search.period === undefined ? {} : { period: search.period }),
    ...(search.start_date === undefined ? {} : { startDate: search.start_date }),
    ...(search.end_date === undefined ? {} : { endDate: search.end_date }),
  };
}

export const HOME_PERIOD_OPTIONS = [
  { key: "last_day", label: "Last Day" },
  { key: "current_week", label: "Current Week" },
  { key: "last_7_days", label: "Last 7 Days" },
  { key: "current_month", label: "Current Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "last_90_days", label: "Last 90 Days" },
  { key: "current_year", label: "Current Year" },
  { key: "last_365_days", label: "Last 365 Days" },
  { key: "last_5_years", label: "Last 5 Years" },
  { key: "last_10_years", label: "Last 10 Years" },
  { key: "all_time", label: "All Time" },
] as const;

export function currentMonthStart(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}
