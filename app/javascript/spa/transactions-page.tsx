import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  TransactionApiError,
  transactionsQueryOptions,
  type SpaTransaction,
  type TransactionCollection,
  type TransactionQuery,
} from "./api/transactions";

type TransactionType = "income" | "expense" | "transfer";

export type TransactionRouteSearch = {
  page?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  types?: TransactionType[];
  status?: ("pending" | "confirmed")[];
  accounts?: string[];
  account_ids?: string[];
  categories?: string[];
  merchants?: string[];
  tags?: string[];
};

const ARRAY_FILTERS = ["accounts", "account_ids", "categories", "merchants", "tags"] as const;

export function validateTransactionSearch(input: Record<string, unknown>): TransactionRouteSearch {
  const pageValue = Number(input.page);
  const result: TransactionRouteSearch = {
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
  const search = stringValue(input.search ?? input["q[search]"]);
  const startDate = stringValue(input.start_date ?? input["q[start_date]"]);
  const endDate = stringValue(input.end_date ?? input["q[end_date]"]);
  const types = arrayValue(input.types ?? input["q[types][]"]).filter(
    (value): value is TransactionType =>
      value === "income" || value === "expense" || value === "transfer",
  );
  const status = arrayValue(input.status ?? input["q[status][]"]).filter(
    (value): value is "pending" | "confirmed" => value === "pending" || value === "confirmed",
  );

  if (search !== undefined) result.search = search;
  if (startDate !== undefined) result.start_date = startDate;
  if (endDate !== undefined) result.end_date = endDate;
  if (types.length > 0) result.types = types;
  if (status.length > 0) result.status = status;

  for (const filter of ARRAY_FILTERS) {
    const values = arrayValue(input[filter] ?? input[`q[${filter}][]`]);
    if (values.length > 0) result[filter] = values;
  }

  return result;
}

export function TransactionsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const routeSearch = useSearch({ from: "/transactions" });
  const navigate = useNavigate({ from: "/transactions" });

  const query: TransactionQuery = {
    ...routeSearch,
    per_page: 25,
  };
  const transactionsQuery = useQuery(
    transactionsQueryOptions(bootstrap.apiPaths.transactions, query),
  );
  const data = transactionsQuery.data;
  const error = transactionsQuery.error
    ? transactionsQuery.error instanceof TransactionApiError
      ? transactionsQuery.error.message
      : "Transaction data did not match the API contract."
    : undefined;

  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(data?.transactions ?? []),
    [data?.transactions],
  );
  const activeFilterCount = countActiveFilters(routeSearch);
  const activeType = routeSearch.types?.length === 1 ? routeSearch.types[0] : undefined;
  const csrfToken =
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";

  function updateSearch(changes: Partial<TransactionRouteSearch>) {
    void navigate({
      search: {
        ...routeSearch,
        ...changes,
        page: changes.page ?? 1,
      },
    });
  }

  return (
    <section
      aria-labelledby="transactions-title"
      className="flex min-h-0 flex-1 flex-col gap-4 pb-6 lg:pb-12"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-secondary">Ledger</p>
          <h1 className="mt-1 text-xl font-medium text-primary" id="transactions-title">
            Transactions
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-secondary bg-container px-4 text-sm font-medium text-primary transition-colors hover:bg-container-hover"
            data-turbo-frame="modal"
            href={bootstrap.railsPaths.newImport}
          >
            Import
          </a>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-lg button-bg-primary px-4 text-sm font-medium text-inverse transition-colors hover:button-bg-primary-hover"
            data-turbo-frame="modal"
            href={bootstrap.railsPaths.newTransaction}
          >
            New transaction
          </a>
        </div>
      </header>

      <TransactionSummary data={data} />

      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-container shadow-border-xs"
        data-controller="drag-and-drop-import"
        id="transactions"
      >
        <form
          action={bootstrap.railsPaths.imports}
          className="hidden"
          data-turbo="false"
          data-drag-and-drop-import-target="form"
          encType="multipart/form-data"
          method="post"
        >
          <input name="authenticity_token" type="hidden" value={csrfToken} />
          <input name="import[type]" type="hidden" value="TransactionImport" />
          <input
            accept=".csv"
            className="hidden"
            data-drag-and-drop-import-target="input"
            name="import[import_file]"
            type="file"
          />
        </form>
        <div
          className="pointer-events-none fixed inset-0 z-50 hidden items-center justify-center bg-overlay backdrop-blur-sm"
          data-drag-and-drop-import-target="overlay"
        >
          <div className="mx-4 w-full max-w-sm rounded-xl bg-container p-6 text-center shadow-border-xs">
            <p className="font-medium text-primary">Drop your CSV here</p>
            <p className="mt-1 text-sm text-secondary">Release to start importing transactions.</p>
          </div>
        </div>
        <div className="space-y-4 border-b border-tertiary p-4">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("search");
              const search = typeof value === "string" ? value.trim() : "";
              updateSearch({
                search: search.length === 0 ? undefined : search,
              });
            }}
          >
            <label className="block grow">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-secondary">
                Search ledger
              </span>
              <input
                className="h-10 w-full rounded-lg border border-secondary bg-container px-3 text-sm text-primary placeholder:text-tertiary focus-ring"
                defaultValue={routeSearch.search ?? ""}
                key={routeSearch.search ?? ""}
                name="search"
                placeholder="Merchant, note, or transaction"
                type="search"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <label>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-secondary">
                  From
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-secondary bg-container px-3 text-sm text-primary focus-ring"
                  onChange={(event) => {
                    updateSearch({
                      start_date:
                        event.currentTarget.value.length === 0
                          ? undefined
                          : event.currentTarget.value,
                    });
                  }}
                  type="date"
                  value={routeSearch.start_date ?? ""}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-secondary">
                  To
                </span>
                <input
                  className="h-10 w-full rounded-lg border border-secondary bg-container px-3 text-sm text-primary focus-ring"
                  onChange={(event) => {
                    updateSearch({
                      end_date:
                        event.currentTarget.value.length === 0
                          ? undefined
                          : event.currentTarget.value,
                    });
                  }}
                  type="date"
                  value={routeSearch.end_date ?? ""}
                />
              </label>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-secondary bg-container px-4 text-sm font-medium text-primary transition-colors hover:bg-container-hover"
              type="submit"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">Transaction type</legend>
              {(
                [
                  [undefined, "All"],
                  ["income", "Income"],
                  ["expense", "Expenses"],
                  ["transfer", "Transfers"],
                ] as const
              ).map(([value, label]) => {
                const active =
                  activeType === value || (activeType === undefined && value === undefined);

                return (
                  <button
                    aria-pressed={active}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-container-inset text-primary"
                        : "text-secondary hover:bg-container-hover hover:text-primary"
                    }`}
                    key={label}
                    onClick={() => {
                      updateSearch({
                        types: value === undefined ? undefined : [value],
                      });
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </fieldset>

            {activeFilterCount > 0 ? (
              <button
                className="text-sm font-medium text-link hover:underline"
                onClick={() =>
                  void navigate({
                    search: { page: 1 },
                  })
                }
                type="button"
              >
                Clear {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"}
              </button>
            ) : null}
          </div>
        </div>

        <div id="transactions-scroll">
          {error !== undefined ? (
            <div className="m-4 rounded-xl border border-destructive bg-container p-5" role="alert">
              <p className="font-medium text-primary">Transactions unavailable</p>
              <p className="mt-1 text-sm text-secondary">{error}</p>
              <button
                className="mt-4 text-sm font-medium text-link hover:underline"
                onClick={() => void transactionsQuery.refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : data === undefined ? (
            <TransactionSkeleton />
          ) : data.transactions.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="font-medium text-primary">No matching transactions</p>
              <p className="mt-1 text-sm text-secondary">
                Change filters or create a new transaction.
              </p>
            </div>
          ) : (
            <div aria-live="polite" className="divide-y divide-tertiary">
              {groupedTransactions.map(([date, transactions]) => (
                <div key={date}>
                  <div className="flex items-center justify-between bg-container-inset px-4 py-2.5">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-secondary">
                      {formatTransactionDate(date)}
                    </h2>
                    <span className="text-xs tabular-nums text-secondary">
                      {transactions.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-tertiary">
                    {transactions.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {data !== undefined ? (
          <Pagination
            onPageChange={(page) => {
              updateSearch({ page });
            }}
            page={data.pagination.page}
            totalPages={data.pagination.total_pages}
          />
        ) : null}
      </div>
    </section>
  );
}

function TransactionSummary({ data }: { data?: TransactionCollection }) {
  const values = data
    ? [
        ["Total transactions", data.summary.count.toLocaleString()],
        ["Income", data.summary.income],
        ["Expenses", data.summary.expense],
      ]
    : [
        ["Total transactions", "—"],
        ["Income", "—"],
        ["Expenses", "—"],
      ];

  return (
    <dl className="grid grid-cols-1 divide-y divide-tertiary overflow-hidden rounded-xl bg-container shadow-border-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {values.map(([label, value]) => (
        <div className="space-y-2 p-4" key={label}>
          <dt className="text-sm text-secondary">{label}</dt>
          <dd className="privacy-sensitive text-xl font-medium tabular-nums text-primary">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TransactionRow({ transaction }: { transaction: SpaTransaction }) {
  const categoryName =
    transaction.category?.name ??
    (transaction.classification === "income" ? "Income" : "Uncategorized");
  const subtitle = transaction.merchant
    ? `${transaction.merchant.name} · ${transaction.account.name}`
    : transaction.account.name;

  return (
    <li
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-container-hover sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.45fr)_auto] ${
        transaction.excluded ? "opacity-50" : ""
      }`}
      id={`entry_${transaction.entry_id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-container-inset text-sm font-semibold text-secondary"
        >
          {transaction.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <a
              className="truncate text-sm font-medium text-primary hover:underline"
              data-turbo-action="advance"
              data-turbo-frame="drawer"
              data-turbo-prefetch="false"
              href={transaction.detail_path}
            >
              {transaction.name}
            </a>
            {transaction.pending ? (
              <span className="rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary">
                Pending
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-secondary">{subtitle}</p>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-container-inset"
          style={
            typeof transaction.category?.color === "string" && transaction.category.color.length > 0
              ? { backgroundColor: transaction.category.color }
              : undefined
          }
        />
        <span className="truncate text-sm text-secondary">{categoryName}</span>
      </div>

      <p
        className={`privacy-sensitive text-right text-sm font-medium tabular-nums ${
          transaction.signed_amount_cents > 0 ? "text-success" : "text-primary"
        }`}
      >
        {transaction.amount}
      </p>
    </li>
  );
}

function Pagination({
  onPageChange,
  page,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Transaction pages"
      className="flex items-center justify-between border-t border-tertiary px-4 py-3"
    >
      <button
        className="rounded-lg border border-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-container-hover disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => {
          onPageChange(page - 1);
        }}
        type="button"
      >
        Previous
      </button>
      <p className="text-sm tabular-nums text-secondary">
        Page {page} of {totalPages}
      </p>
      <button
        className="rounded-lg border border-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-container-hover disabled:cursor-not-allowed disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => {
          onPageChange(page + 1);
        }}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}

function TransactionSkeleton() {
  return (
    <output aria-label="Loading transactions" className="block divide-y divide-tertiary">
      {[0, 1, 2, 3, 4].map((row) => (
        <div className="flex items-center gap-3 px-4 py-3" key={row}>
          <div className="size-10 animate-pulse rounded-full bg-container-inset" />
          <div className="grow space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded-sm bg-container-inset" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-sm bg-container-inset" />
          </div>
          <div className="h-3 w-20 animate-pulse rounded-sm bg-container-inset" />
        </div>
      ))}
    </output>
  );
}

function groupTransactionsByDate(transactions: SpaTransaction[]): [string, SpaTransaction[]][] {
  const groups = new Map<string, SpaTransaction[]>();

  for (const transaction of transactions) {
    const group = groups.get(transaction.date);
    if (group) group.push(transaction);
    else groups.set(transaction.date, [transaction]);
  }

  return [...groups.entries()];
}

function formatTransactionDate(date: string): string {
  const parsedDate = new Date(`${date}T00:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (parsedDate.toDateString() === today.toDateString()) return "Today";
  if (parsedDate.toDateString() === yesterday.toDateString()) return "Yesterday";

  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    day: "numeric",
    month: "long",
    year: parsedDate.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(parsedDate);
}

function countActiveFilters(search: TransactionRouteSearch): number {
  return Object.entries(search).filter(([key, value]) => {
    if (key === "page") return false;
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);

  const string = stringValue(value);
  return string === undefined ? [] : [string];
}
