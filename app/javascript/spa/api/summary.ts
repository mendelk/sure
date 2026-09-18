import { useQuery } from "@tanstack/react-query";
import { z } from "zod/mini";
import { useSpaPaths } from "./paths";

const MoneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
  formatted: z.string(),
});

const BalanceSheetPointSchema = z.object({
  date: z.string(),
  value: MoneySchema,
});

const BalanceSheetAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  classification: z.enum(["asset", "liability"]),
  account_type: z.string(),
  balance: MoneySchema,
  currency: z.string(),
  path: z.string(),
});

const BalanceSheetResponseSchema = z.object({
  currency: z.string(),
  net_worth: MoneySchema,
  assets: MoneySchema,
  liabilities: MoneySchema,
  net_worth_series: z.array(BalanceSheetPointSchema),
  accounts: z.array(BalanceSheetAccountSchema),
});

export type Summary = {
  net_worth: string;
  assets: string;
  liabilities: string;
  currency: string;
  net_worth_series: [string, string][];
  accounts: Array<{
    id: string;
    name: string;
    classification: "asset" | "liability";
    account_type: string;
    balance: string;
    currency: string;
    path: string;
  }>;
};

export type SummaryAccount = Summary["accounts"][number];

export class SummaryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SummaryApiError";
  }
}

async function requestSummary(path: string, signal?: AbortSignal): Promise<Summary> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  const payload: unknown = await response.json();

  if (!response.ok)
    throw new SummaryApiError(`Summary request failed (${response.status})`, response.status);

  const raw = BalanceSheetResponseSchema.parse(payload);
  return {
    net_worth: raw.net_worth.formatted,
    assets: raw.assets.formatted,
    liabilities: raw.liabilities.formatted,
    currency: raw.currency,
    net_worth_series: raw.net_worth_series.map((point) => [point.date, point.value.formatted]),
    accounts: raw.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      classification: account.classification,
      account_type: account.account_type,
      balance: account.balance.formatted,
      currency: account.currency,
      path: account.path,
    })),
  };
}

export function summaryQueryOptions(path: string) {
  return {
    queryKey: ["spa", "summary", path] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) => requestSummary(path, signal),
    staleTime: 30_000,
  };
}

export function useSummaryQuery() {
  const paths = useSpaPaths();

  return useQuery({
    ...summaryQueryOptions(paths.apiPaths.summary),
    retry: (failureCount, error) =>
      !(error instanceof SummaryApiError && error.status < 500) && failureCount < 2,
  });
}
