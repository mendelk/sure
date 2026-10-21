import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { useSpaPaths } from "../api/paths";
import { Icon } from "../icon";
import { Button } from "../components/button";
import { HomeApiError } from "./home-api";

const HomeMoneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
  formatted: z.string(),
});

const MoneyFlowBarSchema = z.object({
  date: z.string(),
  label: z.string(),
  short_label: z.string(),
  income: z.number(),
  expense: z.number(),
  highlighted: z.boolean(),
  partial: z.boolean(),
});

const MoneyFlowAccountSchema = z.object({ id: z.string(), name: z.string() });

const MoneyFlowSchema = z.object({
  bars: z.array(MoneyFlowBarSchema),
  period: z.object({
    start_date: z.string(),
    end_date: z.string(),
    date_range_label: z.string(),
  }),
  month: z.string(),
  month_label: z.string(),
  income: HomeMoneySchema,
  expense: HomeMoneySchema,
  balance: HomeMoneySchema,
  balance_tone: z.enum(["positive", "negative", "neutral"]),
  account_ids: z.nullable(z.array(z.string())),
  accounts: z.array(MoneyFlowAccountSchema),
  accessible_account_ids: z.array(z.string()),
  all_accounts_selected: z.boolean(),
  income_href: z.string(),
  expense_href: z.string(),
});

export type MoneyFlowData = z.infer<typeof MoneyFlowSchema>;
export type MoneyFlowAccount = z.infer<typeof MoneyFlowAccountSchema>;

const MoneyFlowEnvelopeSchema = z.object({ money_flow: MoneyFlowSchema });

function extractMoneyFlow(payload: unknown): MoneyFlowData {
  const envelope = MoneyFlowEnvelopeSchema.safeParse(payload);
  if (envelope.success) return envelope.data.money_flow;
  return MoneyFlowSchema.parse(payload);
}

function moneyFlowQueryOptions(
  basePath: string,
  month: string | undefined,
  accountIds: string[] | undefined,
) {
  const params = new URLSearchParams();
  if (month !== undefined && month.length > 0) params.set("money_flow_month", month);
  if (accountIds !== undefined)
    for (const id of accountIds) params.append("money_flow_account_ids[]", id);
  const query = params.toString();
  const path = query.length > 0 ? `${basePath}?${query}` : basePath;
  return {
    queryKey: ["spa", "home", "money-flow", path] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<MoneyFlowData> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new HomeApiError(`Money flow request failed (${response.status})`, response.status);
      return extractMoneyFlow(payload);
    },
    staleTime: 30_000,
  };
}

export type MoneyFlowText = {
  balance: string;
  chartSpan: string;
  income: string;
  expenses: string;
  selectMonth: string;
  filterAll: string;
  filterCount: string;
  searchAccounts: string;
  apply: string;
  scopeHint: string;
  loading: string;
  loadError: string;
};

const DEFAULT_TEXT: MoneyFlowText = {
  balance: "Transaction balance",
  chartSpan: "Last 6 months",
  income: "Income",
  expenses: "Expenses",
  selectMonth: "Select month",
  filterAll: "All accounts",
  filterCount: "Filter accounts",
  searchAccounts: "Search accounts",
  apply: "Apply",
  scopeHint:
    "Shows the months you pick here — independent of the dashboard's time period at the top.",
  loading: "Loading…",
  loadError: "Money flow could not be loaded.",
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

function monthLabel(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTooltipValue(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return String(value);
  }
}

function MoneyFlowChart({ data, currency }: { data: MoneyFlowData; currency: string }) {
  const [hover, setHover] = useState<{ bar: number; key: "income" | "expense" } | null>(null);
  const bars = data.bars;

  const width = 640;
  const height = 176;
  const margin = { top: 16, right: 4, bottom: 28, left: 4 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue =
    bars.length > 0 ? Math.max(1, ...bars.map((bar) => Math.max(bar.income, bar.expense))) : 1;
  const groupWidth = bars.length > 0 ? innerWidth / bars.length : innerWidth;
  const barWidth = Math.min(22, (groupWidth * 0.7) / 2);
  const ceiling = maxValue * 1.1;

  if (bars.length === 0) return null;

  const hovered = hover === null ? undefined : bars[hover.bar];

  return (
    <div className="relative w-full">
      <div
        onMouseLeave={() => {
          setHover(null);
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-44 w-full"
          aria-label={`${DEFAULT_TEXT.income} / ${DEFAULT_TEXT.expenses} chart`}
        >
          {bars.map((bar, index) => {
            const groupX = margin.left + index * groupWidth;
            const centerX = groupX + groupWidth / 2;
            const incomeHeight =
              bar.income > 0 ? Math.max(2, (bar.income / ceiling) * innerHeight) : 0;
            const expenseHeight =
              bar.expense > 0 ? Math.max(2, (bar.expense / ceiling) * innerHeight) : 0;
            return (
              <g key={bar.date}>
                <rect
                  x={centerX - barWidth - 2}
                  y={margin.top + innerHeight - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx={3}
                  fill="var(--color-success)"
                  fillOpacity={bar.partial ? 0.5 : 1}
                >
                  <title>{`${bar.label}: ${DEFAULT_TEXT.income}`}</title>
                </rect>
                <rect
                  x={centerX + 2}
                  y={margin.top + innerHeight - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx={3}
                  fill="var(--color-gray-400)"
                  fillOpacity={bar.partial ? 0.5 : 1}
                >
                  <title>{`${bar.label}: ${DEFAULT_TEXT.expenses}`}</title>
                </rect>
                <text
                  x={centerX}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={bar.highlighted ? 600 : 500}
                  fill={bar.highlighted ? "var(--color-primary)" : "var(--color-secondary)"}
                  onMouseEnter={() => {
                    setHover({ bar: index, key: "income" });
                  }}
                >
                  {bar.short_label.length > 0 ? bar.short_label : bar.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {hovered !== undefined && hover !== null ? (
        <div className="pointer-events-none absolute z-20 rounded-lg border border-primary bg-container p-3 text-xs shadow-md">
          <div className="mb-1 text-secondary">{hovered.label}</div>
          <div className="flex items-center gap-1.5 font-medium tabular-nums text-primary">
            <span
              className="inline-block size-2 rounded-full"
              style={{
                backgroundColor:
                  hover.key === "income" ? "var(--color-success)" : "var(--color-gray-400)",
              }}
            />
            {hover.key === "income" ? DEFAULT_TEXT.income : DEFAULT_TEXT.expenses}:{" "}
            {formatTooltipValue(hovered[hover.key], currency)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MoneyFlowWidget({
  month,
  accountIds,
  onMonthChange,
  onAccountIdsChange,
  homePath,
  text = DEFAULT_TEXT,
}: {
  month?: string;
  accountIds?: string[];
  onMonthChange: (iso: string) => void;
  onAccountIdsChange: (ids: string[] | undefined) => void;
  homePath: string;
  text?: MoneyFlowText;
}) {
  const paths = useSpaPaths();
  const resolvedPath = homePath.length > 0 ? homePath : paths.apiPaths.home;
  const query = useQuery({
    ...moneyFlowQueryOptions(resolvedPath, month, accountIds),
    retry: (failureCount, error) =>
      !(error instanceof HomeApiError && error.status < 500) && failureCount < 2,
  });
  const data = query.data;

  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  const eligibleAccounts = useMemo(() => data?.accounts ?? [], [data]);
  const accessibleIds = useMemo(
    () => data?.accessible_account_ids ?? eligibleAccounts.map((a) => a.id),
    [data, eligibleAccounts],
  );
  const selectedIds = useMemo(() => {
    if (accountIds !== undefined) return accountIds;
    return data?.account_ids ?? accessibleIds;
  }, [accountIds, data, accessibleIds]);
  const allSelected = selectedIds.length === accessibleIds.length && accessibleIds.length > 0;

  const filteredAccounts = useMemo(() => {
    const needle = accountSearch.trim().toLowerCase();
    if (needle.length === 0) return eligibleAccounts;
    return eligibleAccounts.filter((account) => account.name.toLowerCase().includes(needle));
  }, [eligibleAccounts, accountSearch]);

  const monthOptions = useMemo(() => lastTwelveMonths(), []);

  const balanceToneClass =
    data?.balance_tone === "negative"
      ? "text-destructive"
      : data?.balance_tone === "positive"
        ? "text-success"
        : "text-primary";

  return (
    <div id="money-flow-section" className="space-y-4 px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="text-sm text-secondary">
          {query.isLoading ? text.loading : (data?.period.date_range_label ?? "")}
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
              <span className="capitalize">
                {data !== undefined ? data.month_label : monthLabel(monthOptions[0] ?? "")}
              </span>
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
                    aria-current={month === option || data?.month === option ? "true" : undefined}
                    className={`block w-full px-4 py-2 text-left text-sm capitalize hover:bg-container-hover ${
                      month === option || data?.month === option
                        ? "font-medium text-primary"
                        : "text-primary"
                    }`}
                  >
                    {monthLabel(option)}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              iconProps={{ name: "filter" }}
              onClick={() => {
                setDraftIds([...selectedIds]);
                setAccountFilterOpen((open) => !open);
              }}
            >
              {allSelected ? text.filterAll : `${text.filterCount} (${selectedIds.length})`}
            </Button>
            {accountFilterOpen ? (
              <div className="shadow-border-lg absolute right-0 z-30 mt-2 w-56 space-y-2 rounded-xl bg-container p-3">
                <input
                  type="search"
                  value={accountSearch}
                  onChange={(event) => {
                    setAccountSearch(event.target.value);
                  }}
                  placeholder={text.searchAccounts}
                  aria-label={text.searchAccounts}
                  className="w-full rounded-lg border border-secondary bg-container px-3 py-1.5 text-sm"
                />
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {filteredAccounts.map((account) => {
                    const draft = draftIds ?? [...selectedIds];
                    const checked = draft.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-container-inset-hover"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDraftIds(
                              checked
                                ? draft.filter((id) => id !== account.id)
                                : [...draft, account.id],
                            );
                          }}
                          className="checkbox checkbox--light"
                        />
                        <span className="truncate text-sm text-primary">{account.name}</span>
                      </label>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    const draft = draftIds ?? [...selectedIds];
                    onAccountIdsChange(draft.length === accessibleIds.length ? undefined : draft);
                    setAccountFilterOpen(false);
                  }}
                >
                  {text.apply}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {query.isError ? (
        <p className="text-sm text-destructive">{text.loadError}</p>
      ) : data !== undefined ? (
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="w-full space-y-2 xl:w-3/5">
            <div className="flex items-center justify-between gap-4 px-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-secondary">
                  <span className="size-2 rounded-full bg-success" />
                  {text.income}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-secondary">
                  <span className="size-2 rounded-full bg-subdued" />
                  {text.expenses}
                </span>
              </div>
              <span className="text-xs text-secondary">
                {text.chartSpan} ({data.bars.length})
              </span>
            </div>
            <div className="privacy-sensitive h-44 w-full">
              <MoneyFlowChart data={data} currency={data.income.currency} />
            </div>
          </div>

          <div className="w-full space-y-4 xl:w-2/5">
            <p className="text-sm font-medium text-primary capitalize">{data.month_label}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">{text.balance}</span>
              <span
                className={`text-lg font-medium tabular-nums privacy-sensitive ${balanceToneClass}`}
              >
                {data.balance.formatted}
              </span>
            </div>
            <a
              href={data.income_href}
              className="group flex items-center justify-between rounded-lg border border-secondary p-3 transition-colors hover:bg-container-inset-hover"
            >
              <span className="flex items-center gap-2 text-sm text-primary">
                <span className="size-2.5 rounded-full bg-success" />
                {text.income}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums text-success privacy-sensitive">
                  {data.income.formatted}
                </span>
                <Icon
                  name="chevron-right"
                  size="sm"
                  className="text-secondary transition-colors group-hover:text-primary"
                />
              </span>
            </a>
            <a
              href={data.expense_href}
              className="group flex items-center justify-between rounded-lg border border-secondary p-3 transition-colors hover:bg-container-inset-hover"
            >
              <span className="flex items-center gap-2 text-sm text-primary">
                <span className="size-2.5 rounded-full bg-subdued" />
                {text.expenses}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums text-primary privacy-sensitive">
                  {data.expense.formatted}
                </span>
                <Icon
                  name="chevron-right"
                  size="sm"
                  className="text-secondary transition-colors group-hover:text-primary"
                />
              </span>
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
