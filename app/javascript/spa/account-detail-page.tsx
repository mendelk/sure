// eslint-disable import/max-dependencies -- Account route composes the shared chart, sections, entry rows, controls, and session API.
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import {
  accountDetailQueryOptions,
  type AccountActivity,
  type AccountSearch,
} from "./api/accounts";
import { readCsrfToken, referenceDataQueryOptions, type ReferenceOption } from "./api/transactions";
import { invalidateAccountQueries } from "./api/account-spa";
import { AccountIdSchema, type AccountId, type CategoryId, type EntryId } from "./ids";
import { CategoryIcon, Icon } from "./icon";
import {
  AccountActionControl,
  AccountActionMenu,
  ConfirmSubmit,
  CsrfFields,
} from "./components/account-actions";
import { AccountChartCard } from "./components/account-chart";
import { AccountSectionView } from "./components/account-sections";
import { Button } from "./components/button";
import { BulkActionsBar } from "./components/bulk-actions-bar";
import { FormField } from "./components/form-field";
import { Alert } from "./components/alert";
import { BulkUpdateDrawer } from "./bulk-update-drawer";
import { TransactionRow, TransactionRowHeader } from "./components/transaction-row";
import { TablePaginationBar } from "./components/table";
import { BrandLogo } from "./components/brand-logo";
import { TransactionSearchBox } from "./components/transaction-search-box";
import { currentReturnTo } from "./return-to";

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter((item) => item.length > 0);
  if (typeof value === "string" && value.length > 0) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

export function validateAccountSearch(input: Record<string, unknown>): AccountSearch {
  const page = Number(input.page);
  const result: AccountSearch = { page: Number.isInteger(page) && page > 0 ? page : 1 };
  for (const key of ["tab", "period", "chart_view"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  for (const key of ["start_date", "end_date"] as const) {
    const raw = input[key] ?? input[`q[${key}]`];
    if (
      typeof raw === "string" &&
      /^\d{4}-\d{2}-\d{2}$/u.test(raw) &&
      Number.isFinite(Date.parse(raw))
    )
      result[key] = raw;
  }
  const nested = typeof input.q === "object" && input.q !== null ? input.q : null;
  const readField = (key: string): unknown => {
    if (key in input) return input[key];
    const qKey = `q[${key}]`;
    if (qKey in input) return input[qKey];
    const qArray = `q[${key}][]`;
    if (qArray in input) return input[qArray];
    if (nested !== null && key in nested) return Reflect.get(nested, key);
    return undefined;
  };

  const rawSearch = readField("search");
  if (typeof rawSearch === "string" && rawSearch.length > 0) result.search = rawSearch;

  const parsedAmount = Number(readField("amount"));
  if (Number.isFinite(parsedAmount)) result.amount = parsedAmount;

  const rawOperator = readField("amount_operator");
  if (rawOperator === "equal" || rawOperator === "greater" || rawOperator === "less")
    result.amount_operator = rawOperator;

  const types = arrayValue(readField("types")).filter(
    (value): value is "income" | "expense" | "transfer" =>
      value === "income" || value === "expense" || value === "transfer",
  );
  if (types.length > 0) result.types = types;

  const status = arrayValue(readField("status")).filter(
    (value): value is "confirmed" | "pending" => value === "confirmed" || value === "pending",
  );
  if (status.length > 0) result.status = [...new Set(status)];

  const uncategorized = readField("uncategorized");
  if (
    uncategorized === true ||
    uncategorized === "true" ||
    uncategorized === "1" ||
    uncategorized === "on"
  )
    result.uncategorized = true;

  for (const filter of ["categories", "tags", "excluded_categories", "excluded_tags"] as const) {
    const values = arrayValue(readField(filter));
    if (values.length > 0) result[filter] = values;
  }

  const excludedTypes = arrayValue(readField("excluded_types")).filter(
    (value): value is "income" | "expense" | "transfer" =>
      value === "income" || value === "expense" || value === "transfer",
  );
  if (excludedTypes.length > 0) result.excluded_types = excludedTypes;

  const excludedStatus = arrayValue(readField("excluded_status")).filter(
    (value): value is "confirmed" | "pending" => value === "confirmed" || value === "pending",
  );
  if (excludedStatus.length > 0) result.excluded_status = [...new Set(excludedStatus)];
  const perPage = Number(input.per_page);
  if (Number.isInteger(perPage) && perPage > 0 && perPage <= 100) result.per_page = perPage;
  const year = Number(input.statement_year);
  if (Number.isInteger(year) && year >= 1900 && year <= 9999) result.statement_year = year;
  return result;
}

export function AccountDetailPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateAccountSearch(input),
  });
  const navigate = useNavigate();
  const query = useQuery(accountDetailQueryOptions(accountId, search));
  const data = query.data;
  const text = useMemo(
    () => ({ ...bootstrap.accountDetailText, ...data?.text }),
    [bootstrap.accountDetailText, data?.text],
  );
  const onSearchChange = (patch: Partial<AccountSearch>) => {
    void navigate({
      to: "/accounts/$accountId",
      params: { accountId },
      search: (previous) => ({ ...previous, ...patch, page: patch.page ?? 1 }),
      resetScroll: false,
    });
  };
  if (!data) {
    return (
      <>
        <section
          className="rounded-xl bg-container p-6 shadow-border-xs"
          aria-busy={query.isPending}
        >
          {query.isPending ? (
            <p className="flex items-center gap-2 text-secondary">
              <Icon name="loader-circle" className="animate-spin" />
              {text.loading}
            </p>
          ) : (
            <Alert variant="error" live="alert">
              <p className="mb-3">{text.unavailable}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  void query.refetch();
                }}
              >
                {text.retry}
              </Button>
            </Alert>
          )}
        </section>
        <Outlet />
      </>
    );
  }
  const selectedTab = Math.max(
    0,
    data.tabs.findIndex((tab) => tab.id === data.active_tab),
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col space-y-4 pb-6 lg:pb-12"
      aria-busy={query.isFetching}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo
            className="size-9 rounded-full bg-container-inset"
            style={{ color: data.color }}
            src={data.logo_url}
          >
            <Icon name="credit-card" className="text-inherit!" />
          </BrandLogo>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className={`truncate text-xl font-medium text-primary ${data.syncing ? "animate-pulse" : ""}`}
              >
                {data.name}
              </h1>
              {data.shared ? (
                <span title={data.owner_name ?? undefined}>
                  <Icon name="user" size="sm" />
                </span>
              ) : null}
              {data.tax_treatment !== null && data.tax_treatment !== "" ? (
                <span className="rounded-full bg-container-inset px-2 py-1 text-xs text-secondary">
                  {data.tax_treatment}
                </span>
              ) : null}
              {data.disabled ? (
                <span className="rounded-full bg-container-inset px-2 py-1 text-xs font-medium text-warning">
                  {text.disabled_account}
                </span>
              ) : null}
            </div>
            {data.subtitle !== null && data.subtitle !== "" ? (
              <p className="text-sm text-secondary">{data.subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {data.actions
            .filter((action) => action.key === "complete_setup")
            .map((action) => (
              <AccountActionControl
                key={action.key}
                action={action}
                accountId={accountId}
                search={search}
                text={text}
              />
            ))}
          {data.sync_action ? (
            <AccountActionControl
              action={data.sync_action}
              accountId={accountId}
              search={search}
              text={text}
              disabled={data.syncing}
              iconOnly
            />
          ) : null}
          <AccountActionMenu
            actions={data.actions.filter((action) => action.key !== "complete_setup")}
            label={text.account_menu}
            accountId={accountId}
            search={search}
            text={text}
            iconOnly
          />
        </div>
      </header>
      {query.isError ? (
        <Alert variant="error" live="alert">
          {text.unavailable}
        </Alert>
      ) : null}
      <AccountChartCard
        chart={data.chart}
        text={text}
        selectable={data.account_type.toLowerCase() !== "loan"}
        onSearchChange={onSearchChange}
      />
      {data.fx_warning !== null && data.fx_warning !== "" ? (
        <Alert variant="warning">{data.fx_warning}</Alert>
      ) : null}
      <TabGroup
        className="flex min-h-0 flex-1 flex-col"
        selectedIndex={selectedTab}
        onChange={(index) => {
          onSearchChange({ tab: data.tabs[index].id, page: 1 });
        }}
      >
        <TabList className="mb-4 flex w-fit max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg bg-container-inset p-1">
          {data.tabs.map((tab) => (
            <Tab
              key={tab.id}
              className="focus-ring rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap text-secondary data-selected:bg-container data-selected:text-primary data-selected:shadow-border-xs"
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels className="flex min-h-0 flex-1 flex-col">
          {data.tabs.map((tab) => (
            <TabPanel
              key={tab.id}
              className="flex min-h-0 flex-1 flex-col space-y-4 focus:outline-none"
            >
              {tab.id === data.active_tab ? (
                data.activity ? (
                  <AccountActivityView
                    key={`${accountId}-${JSON.stringify(search)}`}
                    activity={data.activity}
                    accountId={accountId}
                    search={search}
                    text={text}
                    pending={query.isFetching}
                    onSearchChange={onSearchChange}
                  />
                ) : (
                  data.sections.map((section) => (
                    <AccountSectionView
                      key={section.key}
                      section={section}
                      accountId={accountId}
                      search={search}
                      text={text}
                      tableText={bootstrap.reportBuilderText}
                      onSearchChange={onSearchChange}
                    />
                  ))
                )
              ) : null}
            </TabPanel>
          ))}
        </TabPanels>
      </TabGroup>
      <Outlet />
    </div>
  );
}

type ActivityEntry = AccountActivity["groups"][number]["entries"][number];
function ActivityEntryExtras({
  entry,
  accountId,
  search,
  text,
}: {
  entry: ActivityEntry;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
}) {
  const id = useId();
  const edit = entry.activity_edit;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {edit ? (
        <form action={edit.href} method="post">
          <CsrfFields method={edit.method} />
          <FormField
            as="select"
            id={id}
            aria-label={entry.description ?? entry.name}
            name={edit.param}
            defaultValue={edit.value}
            onChange={(event) => {
              event.currentTarget.form?.requestSubmit();
            }}
          >
            {entry.activity_options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FormField>
        </form>
      ) : entry.description !== null && entry.description !== "" ? (
        <span className="text-xs text-secondary">{entry.description}</span>
      ) : null}
      {entry.actions.map((action) => (
        <AccountActionControl
          key={action.key}
          action={action}
          accountId={accountId}
          search={search}
          text={text}
        />
      ))}
    </div>
  );
}
function EntryBadges({ entry }: { entry: ActivityEntry }) {
  return (
    <>
      {entry.badges.map((badge) => (
        <span
          key={badge.label}
          title={badge.tooltip ?? undefined}
          className="inline-flex items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-xs text-secondary"
        >
          {badge.icon !== null && badge.icon !== "" ? (
            <CategoryIcon name={badge.icon} className="size-3" />
          ) : null}
          {badge.label}
        </span>
      ))}
    </>
  );
}
function AccountActivityView({
  activity,
  accountId,
  search,
  text,
  pending,
  onSearchChange,
}: {
  activity: AccountActivity;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  pending: boolean;
  onSearchChange: (patch: Partial<AccountSearch>) => void;
}) {
  const [selected, setSelected] = useState<Set<EntryId>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [columns, setColumns] = useState(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem("account-activity-columns") ?? "null");
      if (
        raw !== null &&
        typeof raw === "object" &&
        "merchant" in raw &&
        "tags" in raw &&
        typeof raw.merchant === "boolean" &&
        typeof raw.tags === "boolean"
      )
        return { merchant: raw.merchant, tags: raw.tags };
    } catch {
      /* Ignore unavailable storage or obsolete preferences. */
    }
    return { merchant: true, tags: true };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const bulkDeleteMutation = useMutation({
    mutationFn: async (entryIds: EntryId[]) => {
      const body = new URLSearchParams();
      for (const id of entryIds) body.append("bulk_delete[entry_ids][]", id);
      const response = await fetch(activity.bulk_actions.delete, {
        body,
        credentials: "same-origin",
        headers: {
          Accept: "application/json, text/html",
          "X-CSRF-Token": readCsrfToken(),
        },
        method: "POST",
        redirect: "manual",
      });
      if (!response.ok && response.type !== "opaqueredirect")
        throw new Error(`Delete failed with status ${response.status}`);
    },
    onError: (caught) => {
      setDeleteError(caught instanceof Error ? caught.message : "Delete failed");
    },
    onSuccess: () => {
      setConfirmDelete(false);
      setSelected(new Set());
      void invalidateAccountQueries(queryClient);
    },
  });
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const reference = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
    ),
  ).data ?? { accounts: [], categories: [], merchants: [], tags: [] };
  const entries = activity.groups.flatMap((group) => group.entries);
  const selectable = entries.filter((entry) => entry.selectable);
  const selectedEntries = selectable.filter((entry) => selected.has(entry.id));
  const allSelected = selectable.length > 0 && selectedEntries.length === selectable.length;
  const select = (ids: EntryId[], checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  return (
    <section className="relative flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-xl bg-container shadow-border-xs">
      <div className="space-y-4 border-b border-tertiary p-4">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-primary">{text.activity}</h2>
          <AccountActionMenu
            actions={activity.new_actions}
            label={text.new}
            accountId={accountId}
            search={search}
            text={text}
          />
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <TransactionSearchBox
            categories={reference.categories}
            routeSearch={search}
            tags={reference.tags}
            updateSearch={onSearchChange}
          />
          <Popover className="relative">
            <PopoverButton as={Button} variant="secondary" size="sm" iconProps={{ name: "filter" }}>
              {text.filter}
              {(search.status?.length ?? 0) + Number(Boolean(search.uncategorized)) > 0
                ? ` (${(search.status?.length ?? 0) + Number(Boolean(search.uncategorized))})`
                : ""}
            </PopoverButton>
            <PopoverPanel className="shadow-border-lg absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-xl bg-container p-4">
              <p className="text-sm font-medium text-primary">{text.status}</p>
              {(["confirmed", "pending"] as const).map((status) => (
                <label key={status} className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="checkbox"
                    className="checkbox checkbox--light"
                    checked={search.status?.includes(status) ?? false}
                    onChange={(event) => {
                      onSearchChange({
                        status: event.target.checked
                          ? [...(search.status ?? []), status]
                          : search.status?.filter((value) => value !== status),
                        page: 1,
                      });
                    }}
                  />
                  {text[status]}
                </label>
              ))}
              <label className="flex items-center gap-2 border-t border-primary pt-3 text-sm text-primary">
                <input
                  type="checkbox"
                  className="checkbox checkbox--light"
                  checked={search.uncategorized ?? false}
                  onChange={(event) => {
                    onSearchChange({ uncategorized: event.target.checked || undefined, page: 1 });
                  }}
                />
                {text.uncategorized_only}
              </label>
            </PopoverPanel>
          </Popover>
          <Popover className="relative">
            <PopoverButton
              as={Button}
              variant="secondary"
              size="sm"
              iconProps={{ name: "sliders-horizontal" }}
            >
              {text.columns}
            </PopoverButton>
            <PopoverPanel className="shadow-border-lg absolute right-0 z-30 mt-2 w-48 space-y-3 rounded-xl bg-container p-4">
              {(["merchant", "tags"] as const).map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm text-primary">
                  <input
                    type="checkbox"
                    className="checkbox checkbox--light"
                    checked={columns[column]}
                    onChange={(event) => {
                      const next = { ...columns, [column]: event.target.checked };
                      setColumns(next);
                      try {
                        localStorage.setItem("account-activity-columns", JSON.stringify(next));
                      } catch {
                        /* Columns still work when storage is unavailable. */
                      }
                    }}
                  />
                  {text[column]}
                </label>
              ))}
            </PopoverPanel>
          </Popover>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" id="account-activity-scroll">
        <div className="sticky top-0 z-20 hidden bg-container md:block">
          <TransactionRowHeader
            showTags={columns.tags}
            labels={{
              transaction: text.date,
              category: text.category,
              tags: text.tags,
              amount: text.amount,
            }}
            selection={
              selectable.length > 0 ? (
                <input
                  type="checkbox"
                  className="checkbox checkbox--light"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  aria-label={text.select_all}
                  onChange={(event) => {
                    select(
                      selectable.map((entry) => entry.id),
                      event.target.checked,
                    );
                  }}
                />
              ) : undefined
            }
          />
        </div>
        {activity.groups.length === 0 ? (
          <p className="py-10 text-center text-secondary">{text.no_entries}</p>
        ) : (
          <div aria-live="polite" className="divide-y divide-tertiary">
            {activity.groups.map((group) => {
              const groupIds = group.entries
                .filter((entry) => entry.selectable)
                .map((entry) => entry.id);
              return (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-container-inset px-4 py-2.5 md:top-10">
                    <div className="flex items-center gap-3">
                      {groupIds.length > 0 ? (
                        <input
                          type="checkbox"
                          className="checkbox checkbox--light"
                          aria-label={`${text.select_all}: ${group.label}`}
                          checked={groupIds.length > 0 && groupIds.every((id) => selected.has(id))}
                          disabled={groupIds.length === 0}
                          onChange={(event) => {
                            select(groupIds, event.target.checked);
                          }}
                        />
                      ) : null}
                      <h2 className="text-xs font-medium uppercase tracking-wide text-secondary">
                        {group.label} <span className="mx-1">&middot;</span> {group.entries.length}
                      </h2>
                    </div>
                    {group.balance !== null && group.balance !== "" ? (
                      <span className="privacy-sensitive text-xs font-medium tabular-nums text-secondary">
                        {group.balance}
                      </span>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-tertiary">
                    {group.entries.map((entry, index) => (
                      <ActivityEntryView
                        key={entry.id}
                        entry={entry}
                        previousParentId={group.entries[index - 1]?.split_parent?.id}
                        accountId={accountId}
                        search={search}
                        text={text}
                        columns={columns}
                        categories={reference.categories}
                        selected={selected.has(entry.id)}
                        onSelect={(value) => {
                          select([entry.id], value);
                        }}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <TablePaginationBar
        className="border-t border-tertiary px-4 py-3"
        disabled={pending}
        itemCount={entries.length}
        labels={{
          pagination: text.activity,
          previous: text.previous_page,
          next: text.next_page,
          perPage: text.per_page,
          rowsPerPage: text.per_page,
        }}
        onPageChange={(page) => {
          onSearchChange({ page });
        }}
        onPerPageChange={(per_page) => {
          onSearchChange({ per_page, page: 1 });
        }}
        page={activity.pagination.page}
        perPage={activity.pagination.per_page}
        totalCount={activity.pagination.total_count}
        totalPages={activity.pagination.total_pages}
      />
      {selectedEntries.length > 0 ? (
        <BulkActionsBar
          closeLabel={text.close}
          countLabel={text.selected_entries.replace("%{count}", String(selectedEntries.length))}
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
            {text.edit_selected}
          </Button>
          {selectedEntries.length === 1 && selectedEntries[0].transaction ? (
            <Link
              to="/accounts/$accountId/transactions/new"
              params={{ accountId }}
              search={{
                ...search,
                account_id: accountId,
                duplicate_transaction_id: selectedEntries[0].transaction.id,
              }}
              resetScroll={false}
              className="focus-ring inline-flex min-h-8 items-center justify-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
            >
              {text.duplicate_selected}
            </Link>
          ) : null}
          {selectedEntries.every(
            (entry) => (entry.transaction?.parent_entry_id ?? null) === null,
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
              {text.delete_selected}
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
        <ConfirmSubmit
          label={text.delete_selected}
          message={text.delete_confirm}
          text={text}
          onCancel={() => {
            setConfirmDelete(false);
          }}
        >
          <Button
            disabled={bulkDeleteMutation.isPending}
            variant="destructive"
            onClick={() => {
              bulkDeleteMutation.mutate(selectedEntries.map((entry) => entry.id));
            }}
          >
            {text.delete_selected}
          </Button>
        </ConfirmSubmit>
      ) : null}
      {bulkEditing ? (
        <BulkUpdateDrawer
          accountId={accountId}
          entryIds={selectedEntries.map((entry) => entry.id)}
          onClose={() => {
            setBulkEditing(false);
          }}
        />
      ) : null}
    </section>
  );
}
function ActivityEntryView({
  entry,
  previousParentId,
  accountId,
  search,
  text,
  columns,
  categories,
  selected,
  onSelect,
}: {
  entry: ActivityEntry;
  previousParentId?: string;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  columns: { merchant: boolean; tags: boolean };
  categories: ReferenceOption<CategoryId>[];
  selected: boolean;
  onSelect: (value: boolean) => void;
}) {
  const extras =
    entry.activity_edit !== null ||
    entry.actions.length > 0 ||
    (entry.description !== null && entry.description !== "") ? (
      <ActivityEntryExtras entry={entry} accountId={accountId} search={search} text={text} />
    ) : undefined;
  const selection = {
    selected,
    disabled: !entry.selectable,
    onChange: onSelect,
    label: text.select_entry.replace("%{name}", entry.name),
  };
  const parent =
    entry.split_parent && entry.split_parent.id !== previousParentId ? (
      <li className="flex items-center justify-between gap-3 bg-container-inset px-4 py-3 text-sm text-secondary">
        <span className="flex items-center gap-2">
          <Icon name="git-branch" size="sm" />
          {entry.split_parent.name}
        </span>
        <span className="privacy-sensitive tabular-nums">{entry.split_parent.amount}</span>
      </li>
    ) : null;
  if (entry.transaction) {
    const row = (
      <TransactionRow
        transaction={entry.transaction}
        accountId={accountId}
        columns={columns}
        indent={Boolean(entry.split_parent)}
        selection={selection}
        amount={entry.amount}
        positive={entry.positive}
        logoUrl={entry.logo_url}
        categories={categories}
        category={extras}
        badges={<EntryBadges entry={entry} />}
      />
    );
    return (
      <>
        {parent}
        {row}
      </>
    );
  }
  return (
    <>
      {parent}
      <li
        id={`entry_${entry.id}`}
        className={`flex items-center gap-3 px-4 py-3 ${entry.excluded ? "opacity-50" : ""} ${entry.split_parent ? "pl-8" : ""}`}
      >
        <input
          type="checkbox"
          className="checkbox checkbox--light shrink-0"
          checked={selected}
          disabled={!entry.selectable}
          aria-label={selection.label}
          onChange={(event) => {
            onSelect(event.target.checked);
          }}
        />
        <BrandLogo className="size-10 rounded-full bg-container-inset" src={entry.logo_url}>
          <Icon name={entry.type === "trade" ? "arrow-left-right" : "chart-bar"} />
        </BrandLogo>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {entry.type === "valuation" ? (
              <Link
                to="/accounts/$accountId/valuations/$valuationId"
                params={{ accountId, valuationId: entry.id }}
                search={() => ({ ...search, return_to: currentReturnTo() })}
                className="truncate text-sm font-medium text-primary hover:underline"
              >
                {entry.name}
              </Link>
            ) : (
              <a
                href={entry.href}
                className="truncate text-sm font-medium text-primary hover:underline"
              >
                {entry.name}
              </a>
            )}
            <EntryBadges entry={entry} />
          </div>
          {extras}
        </div>
        <span
          className={`privacy-sensitive whitespace-nowrap text-sm font-medium tabular-nums ${entry.type === "valuation" ? "text-primary" : entry.positive ? "text-success" : "text-primary"}`}
        >
          {entry.amount}
        </span>
      </li>
    </>
  );
}
