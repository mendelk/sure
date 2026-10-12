// eslint-disable import/max-dependencies -- Account route composes the shared chart, sections, entry rows, controls, and session API.
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Popover,
  PopoverButton,
  PopoverPanel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import {
  accountDetailQueryOptions,
  type AccountActivity,
  type AccountSearch,
} from "./api/accounts";
import { AccountIdSchema, type AccountId, type EntryId } from "./ids";
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
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Alert } from "./components/alert";
import { BulkUpdateDrawer } from "./bulk-update-drawer";
import { TransactionRow } from "./components/transaction-row";

export function validateAccountSearch(input: Record<string, unknown>): AccountSearch {
  const page = Number(input.page);
  const result: AccountSearch = { page: Number.isInteger(page) && page > 0 ? page : 1 };
  for (const key of ["tab", "period", "chart_view"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) result[key] = value;
  }
  for (const key of ["start_date", "end_date"] as const) {
    const value = input[key];
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
      Number.isFinite(Date.parse(value))
    )
      result[key] = value;
  }
  const nested = input.q;
  const nestedSearch =
    typeof nested === "object" && nested !== null && "search" in nested ? nested.search : undefined;
  const nestedStatus =
    typeof nested === "object" && nested !== null && "status" in nested ? nested.status : undefined;
  const nestedUncategorized =
    typeof nested === "object" && nested !== null && "uncategorized" in nested
      ? nested.uncategorized
      : undefined;
  const search = input.search ?? input["q[search]"] ?? nestedSearch;
  if (typeof search === "string" && search.length > 0) result.search = search;
  const status = input.status ?? input["q[status][]"] ?? nestedStatus;
  const statuses = (
    Array.isArray(status) ? status : typeof status === "string" ? status.split(",") : []
  ).filter(
    (value): value is "confirmed" | "pending" => value === "confirmed" || value === "pending",
  );
  if (statuses.length > 0) result.status = [...new Set(statuses)];
  const uncategorized = input.uncategorized ?? input["q[uncategorized]"] ?? nestedUncategorized;
  if (
    uncategorized === true ||
    uncategorized === "true" ||
    uncategorized === "1" ||
    uncategorized === "on"
  )
    result.uncategorized = true;
  const perPage = Number(input.per_page);
  if (Number.isInteger(perPage) && perPage > 0 && perPage <= 100) result.per_page = perPage;
  const year = Number(input.statement_year);
  if (Number.isInteger(year) && year >= 1900 && year <= 9999) result.statement_year = year;
  return result;
}

export function AccountDetailPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const { accountId: rawAccountId } = useParams({ from: "/accounts/$accountId" });
  const accountId = AccountIdSchema.parse(rawAccountId);
  const search = useSearch({ from: "/accounts/$accountId" });
  const navigate = useNavigate({ from: "/accounts/$accountId" });
  const query = useQuery(accountDetailQueryOptions(accountId, search));
  const data = query.data;
  const text = data?.text ?? bootstrap.accountDetailText;
  const onSearchChange = (patch: Partial<AccountSearch>) => {
    void navigate({
      to: "/accounts/$accountId",
      params: { accountId },
      search: (previous) => ({ ...previous, ...patch }),
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
    <div className="space-y-4 pb-20 lg:pb-32" aria-busy={query.isFetching}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-container-inset"
            style={{ color: data.color }}
          >
            {data.logo_url !== null && data.logo_url !== "" ? (
              <img src={data.logo_url} alt="" className="size-full object-contain" />
            ) : (
              <Icon name="credit-card" className="text-inherit!" />
            )}
          </div>
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
        selectedIndex={selectedTab}
        onChange={(index) => {
          onSearchChange({ tab: data.tabs[index].id, page: 1 });
        }}
      >
        <TabList className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-container-inset p-1">
          {data.tabs.map((tab) => (
            <Tab
              key={tab.id}
              className="focus-ring rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap text-secondary data-selected:bg-container data-selected:text-primary data-selected:shadow-border-xs"
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          {data.tabs.map((tab) => (
            <TabPanel key={tab.id} className="space-y-4 focus:outline-none">
              {tab.id === data.active_tab ? (
                data.activity ? (
                  <AccountActivityView
                    key={`${accountId}-${search.page}-${search.search}-${search.status?.join(",")}-${search.uncategorized}`}
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
        "notes" in raw &&
        "tags" in raw &&
        typeof raw.merchant === "boolean" &&
        typeof raw.notes === "boolean" &&
        typeof raw.tags === "boolean"
      )
        return { merchant: raw.merchant, notes: raw.notes, tags: raw.tags };
    } catch {
      /* Ignore unavailable storage or obsolete preferences. */
    }
    return { merchant: true, notes: true, tags: true };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteForm = useRef<HTMLFormElement>(null);
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
    <section className="space-y-4 rounded-xl bg-container p-3 shadow-border-xs lg:p-4">
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
        <form
          key={search.search ?? ""}
          className="min-w-40 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("search");
            onSearchChange({
              search: typeof value === "string" && value.length > 0 ? value : undefined,
              page: 1,
            });
          }}
        >
          <FormField
            id="account-entry-search"
            name="search"
            type="search"
            aria-label={text.search_placeholder}
            placeholder={text.search_placeholder}
            defaultValue={search.search ?? ""}
          />
        </form>
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
            {(["merchant", "notes", "tags"] as const).map((column) => (
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
      <div className="flex items-center justify-between rounded-xl bg-container-inset px-3 py-2 text-xs font-medium uppercase text-secondary">
        <label className="flex items-center gap-3">
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
          {text.date}
        </label>
        <span>{text.amount}</span>
      </div>
      {activity.groups.length === 0 ? (
        <p className="py-10 text-center text-secondary">{text.no_entries}</p>
      ) : (
        activity.groups.map((group) => {
          const groupIds = group.entries
            .filter((entry) => entry.selectable)
            .map((entry) => entry.id);
          return (
            <section key={group.date} className="rounded-xl bg-container-inset p-1">
              <Disclosure>
                <div className="flex items-center gap-3 px-3 py-2">
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
                  <DisclosureButton className="focus-ring flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-xs text-secondary">
                    <p className="space-x-1.5 uppercase font-medium text-xs text-secondary">
                      <span>{group.label}</span>
                      <span>&middot;</span>
                      <span>{group.entries.length}</span>
                    </p>
                    <span className="flex items-center gap-2">
                      <span className="privacy-sensitive tabular-nums">{group.balance}</span>
                      <Icon name="chevron-down" size="sm" />
                    </span>
                  </DisclosureButton>
                </div>
                <DisclosurePanel className="space-y-2 px-4 pb-3">
                  <h3 className="sr-only">{text.reconciliation}</h3>
                  <dl className="space-y-1">
                    {group.reconciliation.map((item) => (
                      <div
                        key={item.label}
                        title={item.tooltip}
                        className={`flex justify-between gap-3 text-xs ${item.style === "final" || item.style === "start" ? "font-medium text-primary" : "text-secondary"} ${item.style === "final" || item.style === "subtotal" ? "border-t border-primary pt-2" : ""}`}
                      >
                        <dt>{item.label}</dt>
                        <dd className="privacy-sensitive tabular-nums">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </DisclosurePanel>
              </Disclosure>
              <ul className="divide-y divide-subdued overflow-hidden rounded-lg bg-container shadow-border-xs">
                {group.entries.map((entry, index) => (
                  <ActivityEntryView
                    key={entry.id}
                    entry={entry}
                    previousParentId={group.entries[index - 1]?.split_parent?.id}
                    accountId={accountId}
                    search={search}
                    text={text}
                    columns={columns}
                    selected={selected.has(entry.id)}
                    onSelect={(value) => {
                      select([entry.id], value);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
      <nav className="flex flex-wrap items-center justify-between gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || activity.pagination.page <= 1}
          onClick={() => {
            onSearchChange({ page: activity.pagination.page - 1 });
          }}
        >
          {text.previous_page}
        </Button>
        <FormField
          as="select"
          id="account-entries-per-page"
          aria-label={text.per_page}
          value={activity.pagination.per_page}
          onChange={(event) => {
            onSearchChange({ per_page: Number(event.target.value), page: 1 });
          }}
        >
          {[10, 25, 50, 100].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </FormField>
        <span className="text-xs tabular-nums text-secondary">
          {activity.pagination.page} / {Math.max(1, activity.pagination.total_pages)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || activity.pagination.page >= activity.pagination.total_pages}
          onClick={() => {
            onSearchChange({ page: activity.pagination.page + 1 });
          }}
        >
          {text.next_page}
        </Button>
      </nav>
      {selectedEntries.length > 0 ? (
        <div className="shadow-border-lg fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-xl bg-container p-3">
          <p className="text-sm text-primary">
            {text.selected_entries.replace("%{count}", String(selectedEntries.length))}
          </p>
          <IconButton
            icon="x"
            label={text.close}
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
          <form
            ref={deleteForm}
            action={activity.bulk_actions.delete}
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              setConfirmDelete(true);
            }}
          >
            <CsrfFields />
            {selectedEntries.map((entry) => (
              <input
                key={entry.id}
                type="hidden"
                name="bulk_delete[entry_ids][]"
                value={entry.id}
              />
            ))}
            <Button type="submit" variant="destructive-outline" size="sm">
              {text.delete_selected}
            </Button>
          </form>
        </div>
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
            variant="destructive"
            onClick={() => {
              deleteForm.current?.submit();
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
  selected,
  onSelect,
}: {
  entry: ActivityEntry;
  previousParentId?: string;
  accountId: AccountId;
  search: AccountSearch;
  text: Record<string, string>;
  columns: { merchant: boolean; notes: boolean; tags: boolean };
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
        selection={selection}
        amount={entry.amount}
        positive={entry.positive}
        logoUrl={entry.logo_url}
        category={extras}
        badges={<EntryBadges entry={entry} />}
      />
    );
    return (
      <>
        {parent}
        {entry.split_parent ? (
          <li className="pl-4">
            <ul>{row}</ul>
          </li>
        ) : (
          row
        )}
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
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-container-inset">
          {entry.logo_url !== null && entry.logo_url !== "" ? (
            <img src={entry.logo_url} alt="" className="size-full object-contain" />
          ) : (
            <Icon name={entry.type === "trade" ? "arrow-left-right" : "chart-bar"} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={entry.href}
              className="truncate text-sm font-medium text-primary hover:underline"
            >
              {entry.name}
            </a>
            <EntryBadges entry={entry} />
          </div>
          {extras}
          {columns.notes && entry.notes !== null && entry.notes !== "" ? (
            <p className="truncate text-xs text-secondary" title={entry.notes}>
              {entry.notes}
            </p>
          ) : null}
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
