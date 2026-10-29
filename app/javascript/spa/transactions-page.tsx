/* eslint-disable import/max-dependencies -- Transactions route composes search, table pagination, drawers, and menus. */
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  bulkDeleteEntries,
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
import { TransactionSearchBox } from "./components/transaction-search-box";
import { fuzzyFilter } from "./fuzzy";
import { collapseTransferPairs } from "./transfer-pairs";
import {
  AccountIdSchema,
  type AccountId,
  type CategoryId,
  type MerchantId,
  type TagId,
  type TransactionId,
} from "./ids";
import { BulkUpdateDrawer } from "./bulk-update-drawer";
import { Button, TabButton } from "./components/button";
import { BulkActionsBar } from "./components/bulk-actions-bar";
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
  filter_order?: string[];
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

// Order entries mirror token keys: `${inputKey}:${value}`. Single-value
// filters (dates, amount) use their inputKey as value.
const SINGLE_VALUE_ORDER_KEYS = ["start_date", "end_date", "amount"] as const;

function orderEntry(inputKey: string, value: string): string {
  return `${inputKey}:${value}`;
}

// Keeps filter_order (the URL source of truth for chip order) in sync with
// each updateSearch call: drops entries for removed values, appends entries
// for added values, preserves surviving order. Returns undefined when empty
// so the key stays out of the URL.
function syncFilterOrder(
  next: TransactionRouteSearch,
  changes: Partial<TransactionRouteSearch>,
): string[] | undefined {
  const arrayKeys = [
    ...ARRAY_FILTERS,
    "types",
    "status",
    "excluded_types",
    "excluded_status",
    "account_ids",
    "excluded_account_ids",
  ] as const satisfies readonly (keyof TransactionRouteSearch)[];
  const nextValues = new Map<string, string[]>();
  for (const key of arrayKeys) {
    const values: unknown = next[key];
    if (Array.isArray(values)) nextValues.set(key, values.map(String));
  }
  for (const key of SINGLE_VALUE_ORDER_KEYS) {
    const value = next[key];
    if (value !== undefined) nextValues.set(key, [String(value)]);
  }

  const kept = (next.filter_order ?? []).filter((entry) => {
    const separator = entry.indexOf(":");
    if (separator === -1) return false;
    const values = nextValues.get(entry.slice(0, separator));
    return values?.includes(entry.slice(separator + 1)) ?? false;
  });
  const keptSet = new Set(kept);
  const appended: string[] = [];
  // Only keys touched by this update can introduce new entries; untouched
  // keys keep their surviving positions.
  for (const key of Object.keys(changes)) {
    const values = nextValues.get(key);
    if (values === undefined) continue;
    for (const value of values) {
      const entry = orderEntry(key, value);
      if (!keptSet.has(entry) && !appended.includes(entry)) appended.push(entry);
    }
  }
  // Values present without an order entry (deep links, legacy URLs) go last
  // in type order — but only when their key was untouched by this update, so
  // a fresh addition always lands after existing filters.
  const changedKeys = new Set(Object.keys(changes));
  for (const key of [...arrayKeys, ...SINGLE_VALUE_ORDER_KEYS]) {
    if (changedKeys.has(key)) continue;
    for (const value of nextValues.get(key) ?? []) {
      const entry = orderEntry(key, value);
      if (!keptSet.has(entry) && !appended.includes(entry)) appended.push(entry);
    }
  }
  const order = [...kept, ...appended];
  return order.length > 0 ? order : undefined;
}

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
  const filterOrder = arrayValue(input.filter_order ?? input["q[filter_order][]"]);
  if (filterOrder.length > 0) result.filter_order = filterOrder;
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

  const { tab: _tab, filter_order: _order, ...searchFilters } = routeSearch;
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

  const visibleTransactions = useMemo(
    () => collapseTransferPairs(data?.transactions ?? []),
    [data?.transactions],
  );
  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(visibleTransactions),
    [visibleTransactions],
  );
  const splitParentsByEntryId = useMemo(
    () => new Map((data?.split_parents ?? []).map((parent) => [parent.entry_id, parent])),
    [data?.split_parents],
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteEntries,
    onError: (caught) => {
      setDeleteError(caught instanceof Error ? caught.message : "Delete failed");
    },
    onSuccess: () => {
      setConfirmDelete(false);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
    },
  });

  const transactionsList = visibleTransactions;
  const selectableTransactions = transactionsList.filter(
    (transaction) => transaction.permissions.can_annotate,
  );
  const selectedTransactions = selectableTransactions.filter((transaction) =>
    selected.has(transaction.id),
  );
  const allSelected =
    selectableTransactions.length > 0 &&
    selectedTransactions.length === selectableTransactions.length;

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
    const next: TransactionRouteSearch = {
      ...routeSearch,
      ...changes,
      page: changes.page ?? 1,
    };
    next.filter_order = syncFilterOrder(next, changes);
    void navigate({ search: next });
  }

  function addMerchantFilter(merchantName: string) {
    const current = routeSearch.merchants ?? [];
    if (current.includes(merchantName)) return;
    updateSearch({ merchants: [...current, merchantName] });
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

          {reference.accounts.some((account) => account.permissions?.can_edit === true) ? (
            <>
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
                className="focus-ring inline-flex md:hidden size-9 items-center justify-center rounded-full button-bg-primary text-inverse transition-colors hover:button-bg-primary-hover"
                search={{ account_id: undefined, nature: undefined }}
                to="/transactions/new"
              >
                <Icon className="text-inverse" name="plus" size="sm" />
              </Link>
            </>
          ) : null}
        </div>
      </header>

      {!recurringDisabled ? (
        <div className="flex max-w-fit rounded-lg bg-surface-inset p-1" role="tablist">
          <TabButton
            onClick={() => {
              setTab("transactions");
            }}
            selected={activeTab === "transactions"}
          >
            Transactions
          </TabButton>
          <TabButton
            onClick={() => {
              setTab("upcoming");
            }}
            selected={activeTab === "upcoming"}
          >
            Upcoming
          </TabButton>
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
              <Button
                aria-expanded={filterOpen}
                className="shrink-0"
                iconProps={{ name: "filter", size: "sm" }}
                onClick={() => {
                  setFilterOpen((value) => !value);
                }}
                variant="outline"
              >
                Filter
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-container-inset px-1.5 text-xs tabular-nums">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
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
                  selectableTransactions.length > 0 ? (
                    <input
                      aria-label="Select all"
                      checked={allSelected}
                      className="checkbox checkbox--light"
                      disabled={selectableTransactions.length === 0}
                      onChange={(event) => {
                        select(
                          selectableTransactions.map((transaction) => transaction.id),
                          event.currentTarget.checked,
                        );
                      }}
                      type="checkbox"
                    />
                  ) : undefined
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
                <Button
                  className="mt-4"
                  onClick={() => void transactionsQuery.refetch()}
                  variant="link"
                >
                  Try again
                </Button>
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
                {groupedTransactions.map(([date, transactions]) => {
                  const groupSelectable = transactions.filter(
                    (transaction) => transaction.permissions.can_annotate,
                  );
                  return (
                    <div key={date}>
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-container-inset px-4 py-2.5 md:top-10">
                        <div className="flex min-w-0 items-center gap-3">
                          {groupSelectable.length > 0 ? (
                            <input
                              aria-label={`Select all for ${formatTransactionDate(date)}`}
                              checked={groupSelectable.every((transaction) =>
                                selected.has(transaction.id),
                              )}
                              className="checkbox checkbox--light shrink-0"
                              disabled={groupSelectable.length === 0}
                              onChange={(event) => {
                                select(
                                  groupSelectable.map((transaction) => transaction.id),
                                  event.currentTarget.checked,
                                );
                              }}
                              type="checkbox"
                            />
                          ) : null}
                          <h2 className="truncate text-xs font-medium uppercase tracking-wide text-secondary">
                            {formatTransactionDate(date)} <span className="mx-1">&middot;</span>{" "}
                            {transactions.length}
                          </h2>
                        </div>
                        <span className="privacy-sensitive text-xs font-medium tabular-nums text-secondary">
                          {formatDailyTotal(transactions)}
                        </span>
                      </div>
                      <ul className="divide-y divide-tertiary">
                        {clusterSplitGroups(transactions, splitParentsByEntryId).map((row) =>
                          row.kind === "single" ? (
                            <TransactionRow
                              categories={reference.categories}
                              columns={columns}
                              key={row.transaction.id}
                              onAddMerchantFilter={addMerchantFilter}
                              selection={{
                                selected: selected.has(row.transaction.id),
                                disabled: false,
                                onChange: (checked) => {
                                  select([row.transaction.id], checked);
                                },
                                label: `Select ${row.transaction.name}`,
                              }}
                              transaction={row.transaction}
                            />
                          ) : (
                            <li
                              className="border-l-2 border-secondary"
                              key={`split-${row.children[0]?.id ?? row.parent?.entry_id}`}
                            >
                              <SplitParentHeader parent={row.parent} />
                              <ul
                                aria-label={`Split parts of ${row.parent?.name ?? "transaction"}`}
                              >
                                {row.children.map((child) => (
                                  <TransactionRow
                                    categories={reference.categories}
                                    columns={columns}
                                    indent
                                    key={child.id}
                                    onAddMerchantFilter={addMerchantFilter}
                                    selection={{
                                      selected: selected.has(child.id),
                                      disabled: false,
                                      onChange: (checked) => {
                                        select([child.id], checked);
                                      },
                                      label: `Select ${child.name}`,
                                    }}
                                    transaction={child}
                                  />
                                ))}
                              </ul>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  );
                })}
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
            <BulkActionsBar
              closeLabel="Close"
              countLabel={`${selectedTransactions.length} transaction${selectedTransactions.length === 1 ? "" : "s"} selected`}
              onClose={() => {
                setSelected(new Set());
              }}
            >
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
              {selectedTransactions.every(
                (transaction) =>
                  transaction.permissions.can_edit &&
                  (transaction.parent_entry_id ?? null) === null,
              ) ? (
                <Button
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    setConfirmDelete(true);
                  }}
                  size="sm"
                  type="button"
                  variant="destructive-outline"
                >
                  Delete selected
                </Button>
              ) : null}
            </BulkActionsBar>
          ) : null}
          {deleteError !== null ? (
            <p className="text-xs text-destructive" role="alert">
              {deleteError}
            </p>
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
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    bulkDeleteMutation.mutate(selectedTransactions.map((t) => t.entry_id));
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
        <Button className="mt-4" onClick={() => void upcomingQuery.refetch()} variant="link">
          Try again
        </Button>
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
function SplitParentHeader({ parent }: { parent: SplitParent | null }) {
  if (parent === null) return null;
  const subtitle =
    parent.merchant?.name === undefined
      ? parent.account_name
      : `${parent.merchant.name} · ${parent.account_name}`;
  return (
    <div className="opacity-70 transition-colors hover:bg-container-hover">
      <Link
        className="focus-ring flex items-center gap-3 px-4 py-3"
        params={{ transactionId: parent.transaction_id }}
        search={true}
        to="/transactions/$transactionId/split/edit"
      >
        <BrandLogo
          className="size-10 shrink-0 rounded-full bg-container-inset text-sm font-semibold text-secondary"
          src={parent.merchant?.logo_url ?? undefined}
        >
          {parent.name.slice(0, 1).toUpperCase()}
        </BrandLogo>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-secondary">{parent.name}</span>
          <span className="block truncate text-xs font-normal text-secondary">{subtitle}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary">
          <Icon name="split" size="sm" />
          Split
        </span>
        <span className="privacy-sensitive shrink-0 text-sm font-medium tabular-nums text-secondary">
          {parent.amount}
        </span>
      </Link>
    </div>
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
        className="focus-ring inline-flex size-9 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-container-inset-hover"
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

type SplitParent = NonNullable<TransactionCollection["split_parents"]>[number];

// Clusters a date group's rows so split children sharing a parent_entry_id
// render consecutively under their parent header. The server appends
// missing siblings adjacently, but filters can interleave unrelated rows.
type DateGroupRow =
  | { kind: "single"; transaction: SpaTransaction }
  | { kind: "split"; parent: SplitParent | null; children: SpaTransaction[] };

function clusterSplitGroups(
  transactions: SpaTransaction[],
  parents: Map<string, SplitParent>,
): DateGroupRow[] {
  const rows: DateGroupRow[] = [];
  const consumed = new Set<string>();

  for (const transaction of transactions) {
    const parentId = transaction.parent_entry_id;
    if (parentId === null || parentId === undefined || consumed.has(transaction.id)) {
      if (!consumed.has(transaction.id)) rows.push({ kind: "single", transaction });
      continue;
    }
    const siblings = transactions.filter((candidate) => candidate.parent_entry_id === parentId);
    for (const sibling of siblings) consumed.add(sibling.id);
    rows.push({
      kind: "split",
      parent: parents.get(parentId) ?? null,
      children: siblings,
    });
  }

  return rows;
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
function formatDailyTotal(transactions: SpaTransaction[]): string {
  if (transactions.length === 0) return "";
  const currency = transactions[0]?.currency ?? "USD";
  const nonTransferTransactions = transactions.filter(
    (t) =>
      !(
        t.transfer?.status === "confirmed" ||
        t.kind === "funds_movement" ||
        t.kind === "cc_payment"
      ),
  );
  const totalCents = nonTransferTransactions.reduce((sum, t) => sum + t.signed_amount_cents, 0);
  return new Intl.NumberFormat(document.documentElement.lang || undefined, {
    style: "currency",
    currency,
  }).format(totalCents / 100);
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
      <Button
        aria-expanded={open}
        iconProps={{ name: "sliders-horizontal", size: "sm" }}
        onClick={() => {
          setOpen((value) => !value);
        }}
        variant="outline"
      >
        Columns
      </Button>
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
          <TabButton
            className="px-3 py-1.5"
            key={key}
            onClick={() => {
              setTab(key);
            }}
            selected={tab === key}
          >
            {label}
          </TabButton>
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
        <Button
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
          variant="link"
        >
          Clear filters
        </Button>
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
  const visible = fuzzyFilter(options, query, (option) => option.name);

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
