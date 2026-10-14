/* eslint-disable import/max-dependencies -- Transactions route composes search, table pagination, drawers, and menus. */
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  referenceDataQueryOptions,
  TransactionApiError,
  transactionsQueryOptions,
  upcomingTransactionsQueryOptions,
  type ReferenceOption,
  type SpaTransaction,
  type TransactionCollection,
  type TransactionQuery,
  type UpcomingRecurringTransaction,
} from "./api/transactions";
import type { SpaBootstrap } from "./bootstrap";
import { TransactionRow, TransactionRowHeader } from "./components/transaction-row";
import { TablePaginationBar } from "./components/table";
import { BrandLogo } from "./components/brand-logo";
import { Icon, type IconName } from "./icon";
import { useDismiss } from "./use-dismiss";
import { useSearchShortcut } from "./use-search-shortcut";
import {
  AccountIdSchema,
  type AccountId,
  type CategoryId,
  type MerchantId,
  type TagId,
  type TransactionId,
} from "./ids";
import { BulkUpdateDrawer } from "./bulk-update-drawer";
import { Button } from "./components/button";
import { IconButton } from "./components/icon-button";
import { CsrfFields } from "./components/account-actions";
import { Modal } from "./modal";

type TransactionType = "income" | "expense" | "transfer";
type AmountOperator = "equal" | "greater" | "less";
export type TransactionRouteSearch = {
  tab?: "transactions" | "upcoming";
  page?: number;
  per_page?: number;
  search?: string;
  start_date?: string;
  end_date?: string;
  amount?: number;
  amount_operator?: AmountOperator;
  types?: TransactionType[];
  status?: ("pending" | "confirmed")[];
  accounts?: string[];
  account_ids?: AccountId[];
  categories?: string[];
  merchants?: string[];
  tags?: string[];
  excluded_categories?: string[];
  excluded_merchants?: string[];
  excluded_tags?: string[];
  excluded_accounts?: string[];
  excluded_account_ids?: AccountId[];
  excluded_types?: TransactionType[];
  excluded_status?: ("pending" | "confirmed")[];
};

const ARRAY_FILTERS = [
  "accounts",
  "categories",
  "merchants",
  "tags",
  "excluded_categories",
  "excluded_merchants",
  "excluded_tags",
  "excluded_accounts",
] as const;

export function validateTransactionSearch(input: Record<string, unknown>): TransactionRouteSearch {
  const pageValue = Number(input.page);
  const result: TransactionRouteSearch = {
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
  const perPageValue = Number(input.per_page);
  if (Number.isInteger(perPageValue) && perPageValue > 0) result.per_page = perPageValue;
  const tab = stringValue(input.tab);
  if (tab === "upcoming") result.tab = "upcoming";

  const search = stringValue(input.search ?? input["q[search]"]);
  const startDate = stringValue(input.start_date ?? input["q[start_date]"]);
  const endDate = stringValue(input.end_date ?? input["q[end_date]"]);
  const amount = numberValue(input.amount ?? input["q[amount]"]);
  const amountOperator = stringValue(input.amount_operator ?? input["q[amount_operator]"]);
  const types = arrayValue(input.types ?? input["q[types][]"]).filter(
    (value): value is TransactionType =>
      value === "income" || value === "expense" || value === "transfer",
  );
  const status = arrayValue(input.status ?? input["q[status][]"]).filter(
    (value): value is "pending" | "confirmed" => value === "pending" || value === "confirmed",
  );
  const excludedTypes = arrayValue(input.excluded_types ?? input["q[excluded_types][]"]).filter(
    (value): value is TransactionType =>
      value === "income" || value === "expense" || value === "transfer",
  );
  const excludedStatus = arrayValue(input.excluded_status ?? input["q[excluded_status][]"]).filter(
    (value): value is "pending" | "confirmed" => value === "pending" || value === "confirmed",
  );

  if (search !== undefined) result.search = search;
  if (startDate !== undefined) result.start_date = startDate;
  if (endDate !== undefined) result.end_date = endDate;
  if (amount !== undefined) result.amount = amount;
  if (amountOperator === "equal" || amountOperator === "greater" || amountOperator === "less")
    result.amount_operator = amountOperator;
  if (types.length > 0) result.types = types;
  if (status.length > 0) result.status = status;
  if (excludedTypes.length > 0) result.excluded_types = excludedTypes;
  if (excludedStatus.length > 0) result.excluded_status = excludedStatus;

  for (const filter of ARRAY_FILTERS) {
    const values = arrayValue(input[filter] ?? input[`q[${filter}][]`]);
    if (values.length > 0) result[filter] = values;
  }
  const uncategorized = input.uncategorized ?? input["q[uncategorized]"];
  if (
    uncategorized === true ||
    uncategorized === "true" ||
    uncategorized === "1" ||
    uncategorized === "on"
  )
    result.categories = [...new Set([...(result.categories ?? []), "Uncategorized"])];
  for (const filter of ["account_ids", "excluded_account_ids"] as const) {
    const values = arrayValue(input[filter] ?? input[`q[${filter}][]`]).map((value) =>
      AccountIdSchema.parse(value),
    );
    if (values.length > 0) result[filter] = values;
  }

  return result;
}

export function TransactionsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const routeSearch = useSearch({ from: "/transactions" });
  const navigate = useNavigate({ from: "/transactions" });

  const recurringDisabled = Boolean(bootstrap.recurringTransactionsDisabled);
  const activeTab = recurringDisabled ? "transactions" : (routeSearch.tab ?? "transactions");

  const { tab: _tab, ...searchFilters } = routeSearch;
  const query: TransactionQuery = {
    ...searchFilters,
    per_page: routeSearch.per_page ?? 25,
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [columns, setColumns] = useState({
    merchant: true,
    tags: true,
  });
  const [selected, setSelected] = useState<Set<TransactionId>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteForm = useRef<HTMLFormElement>(null);

  const transactionsList = data?.transactions ?? [];
  const selectedTransactions = transactionsList.filter((t) => selected.has(t.id));
  const allSelected =
    transactionsList.length > 0 && selectedTransactions.length === transactionsList.length;

  const select = (ids: TransactionId[], checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const reference = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  ).data ?? { accounts: [], categories: [], merchants: [], tags: [] };
  function updateSearch(changes: Partial<TransactionRouteSearch>) {
    void navigate({
      search: {
        ...routeSearch,
        ...changes,
        page: changes.page ?? 1,
      },
    });
  }

  function setColumn(column: "merchant" | "tags", value: boolean) {
    setColumns((previous) => ({ ...previous, [column]: value }));
  }
  function setTab(tab: "transactions" | "upcoming") {
    void navigate({
      search: {
        ...routeSearch,
        tab: tab === "transactions" ? undefined : "upcoming",
        page: 1,
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
          <h1 className="text-xl font-medium text-primary" id="transactions-title">
            Transactions
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <TransactionsMenu
            bootstrap={bootstrap}
            uncategorizedCount={bootstrap.uncategorizedCount ?? 0}
          />

          <a
            className="focus-ring hidden md:inline-flex items-center gap-1.5 rounded-lg border border-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            data-turbo-frame="modal"
            href={bootstrap.railsPaths.newImport}
          >
            <Icon name="download" size="sm" />
            Import
          </a>

          <Link
            className="focus-ring hidden md:inline-flex items-center gap-1.5 rounded-lg button-bg-primary px-4 py-2 text-sm font-medium text-inverse transition-colors hover:button-bg-primary-hover"
            search={{ account_id: undefined, nature: undefined }}
            to="/transactions/new"
          >
            <Icon className="text-inverse" name="plus" size="sm" />
            New transaction
          </Link>

          <Link
            aria-label="New transaction"
            className="focus-ring inline-flex md:hidden h-9 w-9 items-center justify-center rounded-full button-bg-primary text-inverse transition-colors hover:button-bg-primary-hover"
            search={{ account_id: undefined, nature: undefined }}
            to="/transactions/new"
          >
            <Icon className="text-inverse" name="plus" size="sm" />
          </Link>
        </div>
      </header>

      <TransactionSummary data={data} />

      {!recurringDisabled ? (
        <div className="flex max-w-fit rounded-lg bg-surface-inset p-1" role="tablist">
          <button
            aria-selected={activeTab === "transactions"}
            className={`inline-flex w-full items-center justify-center rounded-md px-6 py-1 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 ${
              activeTab === "transactions"
                ? "tab-item-active text-primary shadow-sm"
                : "text-secondary hover:bg-surface-inset-hover"
            }`}
            onClick={() => {
              setTab("transactions");
            }}
            role="tab"
            type="button"
          >
            Transactions
          </button>
          <button
            aria-selected={activeTab === "upcoming"}
            className={`inline-flex w-full items-center justify-center rounded-md px-6 py-1 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200 ${
              activeTab === "upcoming"
                ? "tab-item-active text-primary shadow-sm"
                : "text-secondary hover:bg-surface-inset-hover"
            }`}
            onClick={() => {
              setTab("upcoming");
            }}
            role="tab"
            type="button"
          >
            Upcoming
          </button>
        </div>
      ) : null}

      {activeTab === "transactions" ? (
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-container shadow-border-xs"
          id="transactions"
          role="tabpanel"
        >
          <div className="space-y-4 border-b border-tertiary p-4">
            <div className="flex gap-2">
              <TransactionSearchBox
                accounts={reference.accounts}
                categories={reference.categories}
                merchants={reference.merchants}
                routeSearch={routeSearch}
                tags={reference.tags}
                updateSearch={updateSearch}
              />
              <button
                aria-expanded={filterOpen}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
                onClick={() => {
                  setFilterOpen((value) => !value);
                }}
                type="button"
              >
                <Icon name="filter" size="sm" />
                Filter
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-container-inset px-1.5 text-xs tabular-nums">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <TransactionColumnsPopover columns={columns} onToggle={setColumn} />
            </div>

            {filterOpen ? (
              <TransactionFilterPanel
                accounts={reference.accounts}
                categories={reference.categories}
                merchants={reference.merchants}
                routeSearch={routeSearch}
                tags={reference.tags}
                updateSearch={updateSearch}
              />
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" id="transactions-scroll">
            <div className="sticky top-0 z-20 hidden bg-container md:block">
              <TransactionRowHeader
                selection={
                  <input
                    aria-label="Select all"
                    checked={allSelected}
                    className="checkbox checkbox--light"
                    disabled={transactionsList.length === 0}
                    onChange={(event) => {
                      select(
                        transactionsList.map((t) => t.id),
                        event.currentTarget.checked,
                      );
                    }}
                    type="checkbox"
                  />
                }
                showTags={columns.tags}
              />
            </div>
            {error !== undefined ? (
              <div
                className="m-4 rounded-xl border border-destructive bg-container p-5"
                role="alert"
              >
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
                    <div className="sticky top-0 z-10 flex items-center gap-3 bg-container-inset px-4 py-2.5 md:top-10">
                      <input
                        aria-label={`Select all for ${formatTransactionDate(date)}`}
                        checked={
                          transactions.length > 0 && transactions.every((t) => selected.has(t.id))
                        }
                        className="checkbox checkbox--light"
                        disabled={transactions.length === 0}
                        onChange={(event) => {
                          select(
                            transactions.map((t) => t.id),
                            event.currentTarget.checked,
                          );
                        }}
                        type="checkbox"
                      />
                      <h2 className="text-xs font-medium uppercase tracking-wide text-secondary">
                        {formatTransactionDate(date)} <span className="mx-1">&middot;</span>{" "}
                        {transactions.length}
                      </h2>
                    </div>
                    <ul className="divide-y divide-tertiary">
                      {transactions.map((transaction) => (
                        <TransactionRow
                          categories={reference.categories}
                          columns={columns}
                          key={transaction.id}
                          selection={{
                            selected: selected.has(transaction.id),
                            disabled: false,
                            onChange: (checked) => {
                              select([transaction.id], checked);
                            },
                            label: `Select ${transaction.name}`,
                          }}
                          transaction={transaction}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data !== undefined ? (
            <TablePaginationBar
              className="border-t border-tertiary px-4 py-3"
              disabled={transactionsQuery.isFetching}
              itemCount={data.transactions.length}
              onPageChange={(page) => {
                updateSearch({ page });
              }}
              onPerPageChange={(per_page) => {
                updateSearch({ per_page, page: 1 });
              }}
              page={data.pagination.page}
              perPage={data.pagination.per_page}
              totalCount={data.pagination.total_count}
              totalPages={data.pagination.total_pages}
            />
          ) : null}
          {selectedTransactions.length > 0 ? (
            <div className="shadow-border-lg fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl bg-container p-3">
              <p className="text-sm text-primary">
                {selectedTransactions.length} transaction
                {selectedTransactions.length === 1 ? "" : "s"} selected
              </p>
              <IconButton
                icon="x"
                label="Close"
                onClick={() => {
                  setSelected(new Set());
                }}
              />
              <Button
                onClick={() => {
                  setBulkEditing(true);
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                Edit selected
              </Button>
              {selectedTransactions.length === 1 ? (
                <Link
                  className="focus-ring inline-flex min-h-8 items-center justify-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
                  search={{
                    ...routeSearch,
                    account_id: selectedTransactions[0].account.id,
                    duplicate_transaction_id: selectedTransactions[0].id,
                  }}
                  to="/transactions/new"
                >
                  Duplicate selected
                </Link>
              ) : null}
              <form
                action={bootstrap.railsPaths.bulkDelete ?? "/transactions/bulk_deletion"}
                method="post"
                onSubmit={(event) => {
                  event.preventDefault();
                  setConfirmDelete(true);
                }}
                ref={deleteForm}
              >
                <CsrfFields />
                {selectedTransactions.map((transaction) => (
                  <input
                    key={transaction.entry_id}
                    name="bulk_delete[entry_ids][]"
                    type="hidden"
                    value={transaction.entry_id}
                  />
                ))}
                <Button size="sm" type="submit" variant="destructive-outline">
                  Delete selected
                </Button>
              </form>
            </div>
          ) : null}
          {confirmDelete ? (
            <Modal
              ariaLabelledby="transactions-delete-title"
              onClose={() => {
                setConfirmDelete(false);
              }}
              open
              panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
            >
              <h2 className="text-lg font-medium text-primary" id="transactions-delete-title">
                Delete selected
              </h2>
              <p className="my-4 text-sm text-secondary">
                Delete the selected transactions? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setConfirmDelete(false);
                  }}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    deleteForm.current?.submit();
                  }}
                  variant="destructive"
                >
                  Delete selected
                </Button>
              </div>
            </Modal>
          ) : null}
          {bulkEditing ? (
            <BulkUpdateDrawer
              entryIds={selectedTransactions.map((t) => t.entry_id)}
              onClose={() => {
                setBulkEditing(false);
                setSelected(new Set());
              }}
            />
          ) : null}
        </div>
      ) : (
        <UpcomingTransactionsView recurringPath={bootstrap.apiPaths.recurringTransactions} />
      )}
      <Outlet />
    </section>
  );
}
function UpcomingTransactionsView({ recurringPath }: { recurringPath?: string }) {
  const path = recurringPath ?? "/api/v1/recurring_transactions";
  const upcomingQuery = useQuery(upcomingTransactionsQueryOptions(path));
  const data = upcomingQuery.data;
  const error = upcomingQuery.error
    ? upcomingQuery.error instanceof TransactionApiError
      ? upcomingQuery.error.message
      : "Failed to load upcoming transactions."
    : undefined;

  const grouped = useMemo(
    () => groupUpcomingByDate(data?.recurring_transactions ?? []),
    [data?.recurring_transactions],
  );

  if (error !== undefined) {
    return (
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-destructive bg-container p-5"
        role="alert"
      >
        <p className="font-medium text-primary">Upcoming transactions unavailable</p>
        <p className="mt-1 text-sm text-secondary">{error}</p>
        <button
          className="mt-4 text-sm font-medium text-link hover:underline"
          onClick={() => void upcomingQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === undefined) return <UpcomingSkeleton />;

  if (data.recurring_transactions.length === 0) {
    return (
      <div
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-container px-6 py-40 text-center shadow-border-xs"
        id="upcoming"
        role="tabpanel"
      >
        <p className="mb-2 font-medium text-secondary">No recurring transactions found</p>
        <p className="max-w-xs text-sm text-subdued">
          Upcoming items appear once recurrence dates are known. Credit-card payments appear after
          the estimated statement closes.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-container shadow-border-xs"
      id="upcoming"
      role="tabpanel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto" id="upcoming-scroll">
        <div className="sticky top-0 z-10 hidden bg-container md:block">
          <TransactionRowHeader
            labels={{
              transaction: "Transaction",
              category: "Type",
              tags: "",
              amount: "Amount",
            }}
            showTags={false}
          />
        </div>

        <div aria-live="polite" className="divide-y divide-tertiary">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-2 bg-container-inset px-4 py-2.5">
                <h2 className="text-xs font-medium uppercase tracking-wide text-secondary">
                  {formatUpcomingGroupDate(date)} <span className="mx-1">&middot;</span>{" "}
                  {items.length}
                </h2>
              </div>
              <ul className="divide-y divide-tertiary">
                {items.map((item) => (
                  <UpcomingRow item={item} key={item.id} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UpcomingRow({ item }: { item: UpcomingRecurringTransaction }) {
  const displayName = item.merchant?.name ?? item.name ?? "Recurring transaction";
  const amountInfo = formatUpcomingAmount(item);

  return (
    <li className="group grid grid-cols-2 items-center gap-4 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-container-hover md:grid-cols-12 md:gap-6">
      <div className="col-span-1 flex min-w-0 items-center gap-3 md:col-span-7">
        <BrandLogo
          className="size-9 rounded-full bg-container-inset text-sm font-semibold text-secondary"
          src={item.merchant?.logo_url}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </BrandLogo>

        <div className="min-w-0 truncate">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-primary">{displayName}</span>
            <span className="inline-flex shrink-0 items-center rounded-full bg-blue-tint-10 px-2 py-0.5 text-xs font-medium text-link">
              {item.system_managed_kind === "credit_card_payment"
                ? "Statement estimate"
                : "Projected"}
            </span>
          </div>
          <div className="truncate text-xs font-normal text-secondary">
            {formatExpectedIn(item.next_expected_date)}
          </div>
        </div>
      </div>

      <div className="hidden items-center gap-1 md:col-span-3 md:flex">
        <span className="text-xs text-secondary">
          {item.system_managed_kind === "credit_card_payment" ? "Credit card payment" : "Recurring"}
        </span>
      </div>

      <div className="col-span-1 ml-auto shrink-0 text-right md:col-span-2">
        <p className={`privacy-sensitive font-medium tabular-nums ${amountInfo.className}`}>
          {amountInfo.text}
        </p>
      </div>
    </li>
  );
}

function UpcomingSkeleton() {
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-container shadow-border-xs"
      id="upcoming"
      role="tabpanel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 hidden bg-container md:block">
          <TransactionRowHeader
            labels={{
              transaction: "Transaction",
              category: "Type",
              tags: "",
              amount: "Amount",
            }}
            showTags={false}
          />
        </div>
        <div className="divide-y divide-tertiary">
          {[1, 2].map((group) => (
            <div key={group}>
              <div className="flex items-center gap-2 bg-container-inset px-4 py-2.5">
                <div className="h-4 w-32 animate-pulse rounded-sm bg-container" />
              </div>
              <ul className="divide-y divide-tertiary">
                {[1, 2, 3].map((row) => (
                  <li className="flex items-center justify-between px-4 py-3" key={row}>
                    <div className="flex items-center gap-3">
                      <div className="size-9 animate-pulse rounded-full bg-container-inset" />
                      <div className="space-y-1">
                        <div className="h-4 w-32 animate-pulse rounded-sm bg-container-inset" />
                        <div className="h-3 w-20 animate-pulse rounded-sm bg-container-inset" />
                      </div>
                    </div>
                    <div className="h-4 w-16 animate-pulse rounded-sm bg-container-inset" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatUpcomingGroupDate(dateStr: string): string {
  const parsedDate = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function formatExpectedIn(dateStr: string | null): string {
  if (dateStr === null) return "Due day not configured";
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Expected today";
  if (diffDays === 1) return "Expected in 1 day";
  return `Expected in ${diffDays} days`;
}

function formatUpcomingAmount(item: UpcomingRecurringTransaction): {
  text: string;
  className: string;
} {
  if (item.system_managed_kind === "credit_card_payment")
    return { text: item.amount, className: "text-subdued" };

  const amountStr =
    item.manual &&
    typeof item.expected_amount_avg === "string" &&
    item.expected_amount_avg.length > 0
      ? item.expected_amount_avg
      : item.amount;
  if (item.transfer === true) {
    return {
      text: amountStr,
      className: "text-secondary",
    };
  }
  const isIncome = item.amount_cents < 0;
  return {
    text: amountStr,
    className: isIncome ? "text-success" : "text-subdued",
  };
}

function groupUpcomingByDate(
  items: UpcomingRecurringTransaction[],
): [string, UpcomingRecurringTransaction[]][] {
  const groups: Record<string, UpcomingRecurringTransaction[]> = {};
  for (const item of items) {
    const key = item.next_expected_date;
    if (key === null) continue;
    const list = groups[key] ?? [];
    list.push(item);
    groups[key] = list;
  }
  return Object.entries(groups).toSorted(([a], [b]) => a.localeCompare(b));
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

function TransactionsMenu({
  bootstrap,
  uncategorizedCount,
}: {
  bootstrap: SpaBootstrap;
  uncategorizedCount: number;
}) {
  const newRuleHref = `${bootstrap.railsPaths.newRule}?resource_type=transaction`;
  const rulesHref = bootstrap.railsPaths.rules ?? "/rules";
  const categoriesHref = bootstrap.railsPaths.categories ?? "/categories";
  const tagsHref = bootstrap.railsPaths.tags ?? "/tags";
  const merchantsHref = bootstrap.railsPaths.familyMerchants;
  const importsHref = bootstrap.railsPaths.imports;
  const newImportHref = bootstrap.railsPaths.newImport;
  const categorizeHref = bootstrap.railsPaths.transactionsCategorize ?? "/transactions/categorize";

  const menuItems: {
    icon: IconName;
    label: string;
    href: string;
    frame?: string;
  }[] = [
    {
      icon: "plus",
      label: "New rule",
      href: newRuleHref,
      frame: "modal",
    },
    {
      icon: "git-branch",
      label: "Edit rules",
      href: rulesHref,
      frame: "_top",
    },
    {
      icon: "shapes",
      label: "Edit categories",
      href: categoriesHref,
      frame: "_top",
    },
    {
      icon: "tags",
      label: "Edit tags",
      href: tagsHref,
      frame: "_top",
    },
    {
      icon: "store",
      label: "Edit merchants",
      href: merchantsHref,
      frame: "_top",
    },
    {
      icon: "hard-drive-upload",
      label: "Edit imports",
      href: importsHref,
      frame: "_top",
    },
    {
      icon: "download",
      label: "Import",
      href: newImportHref,
      frame: "modal",
    },
  ];

  if (uncategorizedCount > 0) {
    menuItems.push({
      icon: "tag",
      label: `Categorize (${uncategorizedCount})`,
      href: categorizeHref,
      frame: "_top",
    });
  }

  return (
    <Menu as="div" className="relative shrink-0">
      <MenuButton
        aria-label="Transactions menu"
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-container-inset-hover"
        data-testid="transactions-menu-button"
      >
        <Icon name="more-horizontal" size="md" />
      </MenuButton>

      <MenuItems
        className="shadow-border-lg absolute right-0 top-full z-50 mt-1.5 min-w-[200px] w-max max-w-xs whitespace-normal rounded-lg bg-container py-1 focus:outline-none transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0"
        data-testid="transactions-menu-content"
        transition
      >
        {menuItems.map((item) => (
          <div className="px-1" key={item.label} role="none">
            <MenuItem>
              <a
                className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover data-focus:bg-container-hover"
                data-turbo-frame={item.frame}
                href={item.href}
              >
                <Icon name={item.icon} size="md" />
                <span className="min-w-0 wrap-break-word text-sm text-primary">{item.label}</span>
              </a>
            </MenuItem>
          </div>
        ))}
      </MenuItems>
    </Menu>
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);

  const string = stringValue(value);
  return string === undefined ? [] : [string];
}
function countActiveFilters(search: TransactionRouteSearch): number {
  return Object.entries(search).filter(([key, value]) => {
    if (key === "page") return false;
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
}

type SlackFilterDefinition =
  | {
      key: string;
      kind: "options";
      label: string;
      positiveKey: "accounts" | "categories" | "merchants" | "tags" | "types" | "status" | null;
      excludedKey:
        | "excluded_accounts"
        | "excluded_categories"
        | "excluded_merchants"
        | "excluded_tags"
        | "excluded_types"
        | "excluded_status"
        | null;
      options: { label: string; value: string }[];
    }
  | {
      key: string;
      kind: "branch";
      label: string;
      options: { key: string; label: string }[];
    }
  | {
      key: string;
      kind: "value";
      label: string;
      valueKey: "start_date" | "end_date" | "amount-equal" | "amount-greater" | "amount-less";
    };

type SlackTerm = {
  key: string;
  negated: boolean;
  query: string;
  start: number;
};

function filterDefinitions({
  accounts,
  categories,
  merchants,
  tags,
}: {
  accounts: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants: ReferenceOption<MerchantId>[];
  tags: ReferenceOption<TagId>[];
}): SlackFilterDefinition[] {
  return [
    {
      excludedKey: "excluded_accounts",
      key: "account",
      kind: "options",
      label: "Account",
      options: accounts.map((account) => ({
        label: account.name,
        value: account.name,
      })),
      positiveKey: "accounts",
    },
    {
      key: "date",
      kind: "branch",
      label: "Date",
      options: [
        { key: "start-date", label: "Start date" },
        { key: "end-date", label: "End date" },
      ],
    },
    {
      excludedKey: "excluded_types",
      key: "type",
      kind: "options",
      label: "Type",
      options: [
        { label: "Income", value: "income" },
        { label: "Expenses", value: "expense" },
        { label: "Transfers", value: "transfer" },
      ],
      positiveKey: "types",
    },
    {
      excludedKey: "excluded_status",
      key: "status",
      kind: "options",
      label: "Status",
      options: [
        { label: "Confirmed", value: "confirmed" },
        { label: "Pending", value: "pending" },
      ],
      positiveKey: "status",
    },
    {
      key: "amount",
      kind: "branch",
      label: "Amount",
      options: [
        { key: "amount-equal", label: "Amount equal to" },
        { key: "amount-greater", label: "Amount greater than" },
        { key: "amount-less", label: "Amount less than" },
      ],
    },
    {
      excludedKey: "excluded_categories",
      key: "category",
      kind: "options",
      label: "Category",
      options: [
        { label: "Uncategorized", value: "Uncategorized" },
        ...categories.map((category) => ({
          label: category.name,
          value: category.name,
        })),
      ],
      positiveKey: "categories",
    },
    {
      excludedKey: "excluded_tags",
      key: "tag",
      kind: "options",
      label: "Tag",
      options: [
        { label: "Untagged", value: "Untagged" },
        ...tags.map((tag) => ({ label: tag.name, value: tag.name })),
      ],
      positiveKey: "tags",
    },
    {
      excludedKey: "excluded_merchants",
      key: "merchant",
      kind: "options",
      label: "Merchant",
      options: [
        { label: "No merchant", value: "No merchant" },
        ...merchants.map((merchant) => ({
          label: merchant.name,
          value: merchant.name,
        })),
      ],
      positiveKey: "merchants",
    },
    {
      key: "start-date",
      kind: "value",
      label: "Start date",
      valueKey: "start_date",
    },
    { key: "end-date", kind: "value", label: "End date", valueKey: "end_date" },
    {
      key: "amount-equal",
      kind: "value",
      label: "Amount equal to",
      valueKey: "amount-equal",
    },
    {
      key: "amount-greater",
      kind: "value",
      label: "Amount greater than",
      valueKey: "amount-greater",
    },
    {
      key: "amount-less",
      kind: "value",
      label: "Amount less than",
      valueKey: "amount-less",
    },
  ];
}

function currentTerm(text: string): SlackTerm | null {
  const match: RegExpExecArray | null = /(^|\s)(-?)([a-z-]+):([^:]*)$/iu.exec(text);
  if (match === null) return null;
  const leading = match[1] as string | undefined;
  const negated = match[2] as string | undefined;
  const rawKey = match[3] as string | undefined;
  const rawQuery = match[4] as string | undefined;
  return {
    key: (rawKey ?? "").toLowerCase(),
    negated: negated === "-",
    query: rawQuery ?? "",
    start: match.index + (leading ?? "").length,
  };
}

function findFilter(
  definitions: SlackFilterDefinition[],
  key: string,
): SlackFilterDefinition | null {
  for (const definition of definitions) {
    if (definition.key === key) return definition;
    if (definition.kind === "branch") {
      const child = definition.options.find((option) => option.key === key);
      if (child !== undefined) {
        const leaf = definitions.find((entry) => entry.key === child.key);
        if (leaf !== undefined) return leaf;
      }
    }
  }
  return null;
}

function optionsFor(
  definition: SlackFilterDefinition,
  query: string,
  routeSearch: TransactionRouteSearch,
): { key?: string; label: string; value: string }[] {
  const needle = query.trim().toLowerCase();
  if (definition.kind === "branch") {
    return definition.options
      .filter((option) => option.label.toLowerCase().includes(needle))
      .map((option) => ({
        key: option.key,
        label: option.label,
        value: option.label,
      }));
  }
  if (definition.kind === "value") {
    const value = query.trim();
    return value.length > 0 ? [{ label: value, value }] : [];
  }
  const selected = new Set<string>();
  for (const value of definition.positiveKey === null
    ? []
    : (routeSearch[definition.positiveKey] ?? [])) {
    selected.add(value);
    if (value === "__uncategorized__") selected.add("Uncategorized");
    if (value === "Uncategorized") selected.add("__uncategorized__");
    if (value === "__no_merchant__") selected.add("No merchant");
    if (value === "No merchant") selected.add("__no_merchant__");
    if (value === "__untagged__") selected.add("Untagged");
    if (value === "Untagged") selected.add("__untagged__");
  }
  for (const value of definition.excludedKey === null
    ? []
    : (routeSearch[definition.excludedKey] ?? [])) {
    selected.add(value);
    if (value === "__uncategorized__") selected.add("Uncategorized");
    if (value === "Uncategorized") selected.add("__uncategorized__");
    if (value === "__no_merchant__") selected.add("No merchant");
    if (value === "No merchant") selected.add("__no_merchant__");
    if (value === "__untagged__") selected.add("Untagged");
    if (value === "Untagged") selected.add("__untagged__");
  }
  return definition.options
    .filter((option) => !selected.has(option.value))
    .filter((option) => option.label.toLowerCase().includes(needle))
    .slice(0, 30);
}

function applyValueFilter(
  definition: Extract<SlackFilterDefinition, { kind: "value" }>,
  value: string,
  updateSearch: (changes: Partial<TransactionRouteSearch>) => void,
) {
  const trimmed = value.trim();
  if (definition.valueKey === "start_date" || definition.valueKey === "end_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return;
    updateSearch(
      definition.valueKey === "start_date" ? { start_date: trimmed } : { end_date: trimmed },
    );
    return;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return;
  if (definition.valueKey === "amount-equal")
    updateSearch({ amount: parsed, amount_operator: "equal" });
  if (definition.valueKey === "amount-greater")
    updateSearch({ amount: parsed, amount_operator: "greater" });
  if (definition.valueKey === "amount-less")
    updateSearch({ amount: parsed, amount_operator: "less" });
}

function formatFilterToken(value: string): string {
  if (value === "__uncategorized__") return "Uncategorized";
  if (value === "__no_merchant__") return "No merchant";
  if (value === "__untagged__") return "Untagged";
  return value;
}
function selectedTokens(routeSearch: TransactionRouteSearch): {
  displayValue: string;
  inputKey: string;
  label: string;
  remove: (updateSearch: (changes: Partial<TransactionRouteSearch>) => void) => void;
  value: string;
}[] {
  const tokens: {
    displayValue: string;
    inputKey: string;
    label: string;
    remove: (updateSearch: (changes: Partial<TransactionRouteSearch>) => void) => void;
    value: string;
  }[] = [];

  function pushOptions(
    values: readonly string[] | undefined,
    label: string,
    inputKey: string,
    remove: (value: string) => Partial<TransactionRouteSearch>,
  ) {
    for (const value of values ?? []) {
      tokens.push({
        displayValue: formatFilterToken(value),
        inputKey,
        label,
        remove: (updateSearch) => {
          updateSearch(remove(value));
        },
        value,
      });
    }
  }

  pushOptions(routeSearch.accounts, "Account", "accounts", (value) => ({
    accounts: (routeSearch.accounts ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.categories, "Category", "categories", (value) => ({
    categories: (routeSearch.categories ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.merchants, "Merchant", "merchants", (value) => ({
    merchants: (routeSearch.merchants ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.tags, "Tag", "tags", (value) => ({
    tags: (routeSearch.tags ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.types, "Type", "types", (value) => ({
    types: (routeSearch.types ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.status, "Status", "status", (value) => ({
    status: (routeSearch.status ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_categories, "-Category", "excluded_categories", (value) => ({
    excluded_categories: (routeSearch.excluded_categories ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_merchants, "-Merchant", "excluded_merchants", (value) => ({
    excluded_merchants: (routeSearch.excluded_merchants ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_tags, "-Tag", "excluded_tags", (value) => ({
    excluded_tags: (routeSearch.excluded_tags ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_accounts, "-Account", "excluded_accounts", (value) => ({
    excluded_accounts: (routeSearch.excluded_accounts ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_types, "-Type", "excluded_types", (value) => ({
    excluded_types: (routeSearch.excluded_types ?? []).filter((item) => item !== value),
  }));
  pushOptions(routeSearch.excluded_status, "-Status", "excluded_status", (value) => ({
    excluded_status: (routeSearch.excluded_status ?? []).filter((item) => item !== value),
  }));

  if (routeSearch.start_date !== undefined) {
    tokens.push({
      displayValue: routeSearch.start_date,
      inputKey: "start_date",
      label: "Start date",
      remove: (updateSearch) => {
        updateSearch({ start_date: undefined });
      },
      value: routeSearch.start_date,
    });
  }
  if (routeSearch.end_date !== undefined) {
    tokens.push({
      displayValue: routeSearch.end_date,
      inputKey: "end_date",
      label: "End date",
      remove: (updateSearch) => {
        updateSearch({ end_date: undefined });
      },
      value: routeSearch.end_date,
    });
  }
  if (routeSearch.amount !== undefined) {
    const operator = routeSearch.amount_operator ?? "equal";
    const label =
      operator === "greater"
        ? "Amount greater than"
        : operator === "less"
          ? "Amount less than"
          : "Amount equal to";
    tokens.push({
      displayValue: String(routeSearch.amount),
      inputKey: "amount",
      label,
      remove: (updateSearch) => {
        updateSearch({ amount: undefined, amount_operator: undefined });
      },
      value: String(routeSearch.amount),
    });
  }

  return tokens;
}

function TransactionSearchBox({
  accounts,
  categories,
  merchants,
  routeSearch,
  tags,
  updateSearch,
}: {
  accounts: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants: ReferenceOption<MerchantId>[];
  routeSearch: TransactionRouteSearch;
  tags: ReferenceOption<TagId>[];
  updateSearch: (changes: Partial<TransactionRouteSearch>) => void;
}) {
  const [text, setText] = useState(routeSearch.search ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(inputRef);
  const tokens = selectedTokens(routeSearch);
  const searchParam = routeSearch.search ?? "";
  const [committedSearch, setCommittedSearch] = useState(searchParam);
  if (searchParam !== committedSearch) {
    setCommittedSearch(searchParam);
    setText(searchParam);
  }

  const term = currentTerm(text);
  const definitions = filterDefinitions({
    accounts,
    categories,
    merchants,
    tags,
  });
  const definition = term === null ? null : findFilter(definitions, term.key);
  const options =
    term === null || definition === null || (term.negated && definition.kind !== "options")
      ? []
      : optionsFor(definition, term.query, routeSearch);

  function choose(option: { key?: string; label: string; value: string } | null) {
    if (option === null || definition === null || term === null) return;
    if (definition.kind === "branch") {
      if (option.key !== undefined) setText(`${text.slice(0, term.start)}${option.key}:`);
      return;
    }
    if (definition.kind === "options") {
      if (term.negated && definition.excludedKey !== null) {
        const current = routeSearch[definition.excludedKey] ?? [];
        if (!current.includes(option.value)) {
          updateSearch({
            [definition.excludedKey]: [...current, option.value],
          });
        }
      } else if (definition.positiveKey !== null) {
        const current = routeSearch[definition.positiveKey] ?? [];
        if (!current.includes(option.value)) {
          updateSearch({
            [definition.positiveKey]: [...current, option.value],
          });
        }
      }
    } else applyValueFilter(definition, option.value, updateSearch);
    setText("");
  }

  function submitFreeText() {
    const search = text.trim();
    if (search.length === 0 && routeSearch.search !== undefined)
      updateSearch({ search: undefined });
    else if (search.length > 0 && search !== routeSearch.search) updateSearch({ search });
  }

  return (
    <Combobox immediate onChange={choose} value={null}>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-secondary bg-container px-3 py-1.5 focus-ring">
          <Icon className="shrink-0 text-secondary" name="search" size="sm" />
          {tokens.map((token) => (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-container-inset px-2 py-0.5 text-xs font-medium text-primary"
              key={`${token.inputKey}:${token.value}`}
            >
              <span>
                {token.label}: {token.displayValue}
              </span>
              <button
                aria-label={`Remove filter ${token.label}: ${token.displayValue}`}
                className="text-secondary hover:text-primary"
                onClick={() => {
                  token.remove(updateSearch);
                }}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          <ComboboxInput
            autoComplete="off"
            className="form-field__input min-w-40 flex-1 placeholder:text-sm placeholder:text-secondary"
            displayValue={() => text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && options.length === 0) {
                event.preventDefault();
                submitFreeText();
              } else if (event.key === "Backspace" && text.length === 0 && tokens.length > 0) {
                event.preventDefault();
                tokens.at(-1)?.remove(updateSearch);
              }
            }}
            placeholder={
              tokens.length > 0 ? "" : "Search or filter... (category:, -tag:, amount-greater:...)"
            }
            ref={inputRef}
          />
        </div>
        {options.length > 0 && term !== null && definition !== null ? (
          <ComboboxOptions
            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-secondary bg-container p-1.5 shadow-lg"
            static
          >
            {options.map((option) => (
              <ComboboxOption
                className={({ focus }) =>
                  `flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-surface-hover ${
                    focus ? "bg-surface-hover" : ""
                  }`
                }
                key={`${definition.key}:${option.value}`}
                value={option}
              >
                {option.label}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        ) : null}
      </div>
    </Combobox>
  );
}

function TransactionColumnsPopover({
  columns,
  onToggle,
}: {
  columns: { merchant: boolean; tags: boolean };
  onToggle: (column: "merchant" | "tags", value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(ref, () => {
    setOpen(false);
  });

  const entries = [
    ["tags", "Tags", "tag"],
    ["merchant", "Merchant", "store"],
  ] as const;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-secondary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
        onClick={() => {
          setOpen((value) => !value);
        }}
        type="button"
      >
        <Icon name="sliders-horizontal" size="sm" />
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-secondary bg-container p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-secondary">
            Details columns
          </p>
          {entries.map(([key, label, icon]) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-container-hover"
              key={key}
            >
              <input
                checked={columns[key]}
                className="checkbox checkbox--light"
                onChange={(event) => {
                  onToggle(key, event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <Icon name={icon} size="sm" />
              {label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const TABS = [
  ["category", "Category"],
  ["account", "Account"],
  ["date", "Date"],
  ["type", "Type"],
  ["status", "Status"],
  ["amount", "Amount"],
  ["tag", "Tag"],
  ["merchant", "Merchant"],
] as const;

function TransactionFilterPanel({
  accounts,
  categories,
  merchants,
  routeSearch,
  tags,
  updateSearch,
}: {
  accounts: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants: ReferenceOption<MerchantId>[];
  routeSearch: TransactionRouteSearch;
  tags: ReferenceOption<TagId>[];
  updateSearch: (changes: Partial<TransactionRouteSearch>) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("category");

  return (
    <div className="overflow-hidden rounded-xl border border-secondary">
      <div className="flex gap-1 overflow-x-auto border-b border-secondary p-2" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            aria-selected={tab === key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === key
                ? "bg-container-inset text-primary"
                : "text-secondary hover:bg-container-hover"
            }`}
            key={key}
            onClick={() => {
              setTab(key);
            }}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-y-auto p-3">
        {tab === "date" ? (
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-secondary">
              From
              <input
                className="ml-1 h-8 rounded-sm border border-secondary bg-container px-2 text-xs text-primary"
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
            <label className="text-xs text-secondary">
              To
              <input
                className="ml-1 h-8 rounded-sm border border-secondary bg-container px-2 text-xs text-primary"
                onChange={(event) => {
                  updateSearch({
                    end_date:
                      event.currentTarget.value.length === 0
                        ? undefined
                        : event.currentTarget.value,
                  });
                }}
              />
            </label>
          </div>
        ) : null}
        {tab === "type" ? (
          <FilterCheckboxes
            emptyLabel="No types."
            onChange={(values) => {
              const next = values.filter((value) => isTransactionType(value));
              updateSearch({ types: next.length > 0 ? next : undefined });
            }}
            options={[
              { id: "income", name: "Income" },
              { id: "expense", name: "Expenses" },
              { id: "transfer", name: "Transfers" },
            ]}
            selected={routeSearch.types ?? []}
          />
        ) : null}
        {tab === "status" ? (
          <FilterCheckboxes
            emptyLabel="No statuses."
            onChange={(values) => {
              const next = values.filter((value) => isTransactionStatus(value));
              updateSearch({ status: next.length > 0 ? next : undefined });
            }}
            options={[
              { id: "confirmed", name: "Confirmed" },
              { id: "pending", name: "Pending" },
            ]}
            selected={routeSearch.status ?? []}
          />
        ) : null}
        {tab === "amount" ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-secondary">
              Operator
              <select
                className="ml-1 h-8 rounded-sm border border-secondary bg-container px-2 text-xs text-primary"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateSearch({
                    amount_operator:
                      value === "greater" || value === "less" || value === "equal"
                        ? value
                        : undefined,
                  });
                }}
                value={routeSearch.amount_operator ?? "equal"}
              >
                <option value="equal">Equal to</option>
                <option value="greater">Greater than</option>
                <option value="less">Less than</option>
              </select>
            </label>
            <label className="text-xs text-secondary">
              Amount
              <input
                className="ml-1 h-8 w-32 rounded-sm border border-secondary bg-container px-2 text-xs text-primary"
                inputMode="decimal"
                min={0}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  updateSearch({
                    amount: Number.isFinite(value) ? value : undefined,
                  });
                }}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={routeSearch.amount ?? ""}
              />
            </label>
          </div>
        ) : null}
        {tab === "account" ? (
          <FilterCheckboxes
            emptyLabel="No accounts."
            onChange={(values) => {
              updateSearch({ accounts: values.length > 0 ? values : undefined });
            }}
            options={accounts.map((account) => ({ id: account.name, name: account.name }))}
            selected={routeSearch.accounts ?? []}
          />
        ) : null}
        {tab === "category" ? (
          <FilterCheckboxes
            emptyLabel="No categories."
            onChange={(values) => {
              updateSearch({ categories: values.length > 0 ? values : undefined });
            }}
            options={[
              { id: "Uncategorized", name: "Uncategorized" },
              ...categories.map((category) => ({
                id: category.name,
                name: category.name,
              })),
            ]}
            selected={routeSearch.categories ?? []}
          />
        ) : null}
        {tab === "tag" ? (
          <FilterCheckboxes
            emptyLabel="No tags."
            onChange={(values) => {
              updateSearch({ tags: values.length > 0 ? values : undefined });
            }}
            options={[
              { id: "Untagged", name: "Untagged" },
              ...tags.map((tag) => ({ id: tag.name, name: tag.name })),
            ]}
            selected={routeSearch.tags ?? []}
          />
        ) : null}
        {tab === "merchant" ? (
          <FilterCheckboxes
            emptyLabel="No merchants."
            onChange={(values) => {
              updateSearch({ merchants: values.length > 0 ? values : undefined });
            }}
            options={[
              { id: "No merchant", name: "No merchant" },
              ...merchants.map((merchant) => ({
                id: merchant.name,
                name: merchant.name,
              })),
            ]}
            selected={routeSearch.merchants ?? []}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-secondary p-2">
        <span className="px-2 text-xs text-secondary">
          Tip: prefix with - for exclusions (e.g. -category:Groceries).
        </span>
        <button
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-link hover:underline"
          onClick={() => {
            updateSearch({
              accounts: undefined,
              amount: undefined,
              amount_operator: undefined,
              categories: undefined,
              end_date: undefined,
              excluded_accounts: undefined,
              excluded_categories: undefined,
              excluded_merchants: undefined,
              excluded_status: undefined,
              excluded_tags: undefined,
              excluded_types: undefined,
              merchants: undefined,
              search: undefined,
              start_date: undefined,
              status: undefined,
              tags: undefined,
              types: undefined,
            });
          }}
          type="button"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}

function FilterCheckboxes<TValue extends string>({
  emptyLabel,
  onChange,
  options,
  selected,
}: {
  emptyLabel: string;
  onChange: (values: TValue[]) => void;
  options: { id: TValue; name: string }[];
  selected: TValue[];
}) {
  const [query, setQuery] = useState("");
  const visible = options.filter((option) =>
    option.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <input
        aria-label="Filter options"
        className="mb-2 h-8 w-full rounded-sm border border-secondary bg-container px-2 text-xs text-primary placeholder:text-tertiary"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
        placeholder="Filter options..."
        type="search"
        value={query}
      />
      {visible.length === 0 ? (
        <p className="px-1 py-2 text-sm text-secondary">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {visible.map((option) => {
            const isChecked =
              selected.includes(option.id) ||
              (option.id === "Uncategorized" &&
                (selected as string[]).includes("__uncategorized__")) ||
              (option.id === "No merchant" && (selected as string[]).includes("__no_merchant__")) ||
              (option.id === "Untagged" && (selected as string[]).includes("__untagged__"));
            return (
              <li key={option.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-primary hover:bg-container-hover">
                  <input
                    checked={isChecked}
                    className="checkbox checkbox--light"
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      if (checked) {
                        onChange([...selected, option.id]);
                        return;
                      }
                      onChange(
                        selected.filter((item) => {
                          if (item === option.id) return false;
                          if (
                            option.id === "Uncategorized" &&
                            (item as string) === "__uncategorized__"
                          )
                            return false;
                          if (option.id === "No merchant" && (item as string) === "__no_merchant__")
                            return false;
                          if (option.id === "Untagged" && (item as string) === "__untagged__")
                            return false;
                          return true;
                        }),
                      );
                    }}
                    type="checkbox"
                  />
                  {option.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function isTransactionType(value: string): value is TransactionType {
  return value === "income" || value === "expense" || value === "transfer";
}

function isTransactionStatus(value: string): value is "pending" | "confirmed" {
  return value === "pending" || value === "confirmed";
}
