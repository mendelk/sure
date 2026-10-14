/* eslint-disable import/max-dependencies -- Row composes category picker, transfer match, tags, and merchant menus. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  createTransferMatch,
  recentCategoriesQueryOptions,
  transferMatchCandidatesQueryOptions,
  transactionDetailQueryOptions,
  updateTransaction,
  updateTransferStatus,
  type ReferenceOption,
  type SpaTransaction,
  type TransactionUpdateInput,
} from "../api/transactions";
import type { SpaBootstrap } from "../bootstrap";
import { CategoryIcon, Icon } from "../icon";
import type { AccountId, CategoryId, MerchantId, TransactionId } from "../ids";
import { useDismiss } from "../use-dismiss";
import { currentReturnTo } from "../return-to";
import { IconButton } from "./icon-button";
import { TagSelect } from "./tag-select";
import { SearchablePicker, type PickerOption } from "./searchable-picker";
import { BrandLogo } from "./brand-logo";
const transactionGridClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-12";
const defaultColumnLabels = {
  transaction: "Transaction",
  category: "Category",
  tags: "Tags",
  amount: "Amount",
};

export function TransactionRowHeader({
  showTags,
  selection,
  labels = defaultColumnLabels,
}: {
  showTags: boolean;
  selection?: ReactNode;
  labels?: {
    transaction: string;
    category: string;
    tags: string;
    amount: string;
  };
}) {
  return (
    <div
      className={`${transactionGridClass} bg-container-inset px-4 py-3 text-xs font-medium uppercase text-secondary`}
    >
      <div
        className={`flex min-w-0 items-center gap-3 ${showTags ? "md:col-span-5" : "md:col-span-7"}`}
      >
        {selection}
        <span>{labels.transaction}</span>
      </div>
      <span className="hidden md:col-span-3 md:block">{labels.category}</span>
      {showTags ? <span className="hidden md:col-span-2 md:block">{labels.tags}</span> : null}
      <span className="text-right md:col-span-2">{labels.amount}</span>
    </div>
  );
}

export function TransactionRow({
  accountId,
  amount,
  badges,
  categories,
  category,
  columns,
  logoUrl,
  indent = false,
  positive,
  selection,
  transaction,
  onAddMerchantFilter,
}: {
  accountId?: AccountId;
  amount?: string;
  badges?: ReactNode;
  categories?: ReferenceOption<CategoryId>[];
  category?: ReactNode;
  columns: { merchant: boolean; tags: boolean };
  indent?: boolean;
  logoUrl?: string | null;
  positive?: boolean;
  selection?: {
    selected: boolean;
    disabled: boolean;
    onChange: (value: boolean) => void;
    label: string;
  };
  transaction: SpaTransaction;
  onAddMerchantFilter?: (merchantName: string) => void;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const categoryName =
    transaction.category?.name ??
    (transaction.classification === "income" ? "Income" : "Uncategorized");

  return (
    <li
      className={`group ${transactionGridClass} px-4 py-3 transition-colors hover:bg-container-hover ${
        transaction.excluded ? "opacity-50" : ""
      }`}
      id={`entry_${transaction.entry_id}`}
    >
      <div
        className={`flex min-w-0 items-center gap-3 ${columns.tags ? "md:col-span-5" : "md:col-span-7"} ${indent ? "pl-4" : ""}`}
      >
        {selection ? (
          <input
            aria-label={selection.label}
            checked={selection.selected}
            className="checkbox checkbox--light shrink-0"
            disabled={selection.disabled}
            onChange={(event) => {
              selection.onChange(event.currentTarget.checked);
            }}
            type="checkbox"
          />
        ) : null}
        <BrandLogo
          className="size-10 rounded-full bg-container-inset text-sm font-semibold text-secondary"
          src={logoUrl ?? transaction.logo_url ?? transaction.merchant?.logo_url}
        >
          {transaction.name.slice(0, 1).toUpperCase()}
        </BrandLogo>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              className="truncate text-sm font-medium text-primary hover:underline"
              params={
                accountId
                  ? { accountId, transactionId: transaction.id }
                  : { transactionId: transaction.id }
              }
              resetScroll={false}
              search={(previous) => previous}
              to={
                accountId
                  ? "/accounts/$accountId/transactions/$transactionId"
                  : "/transactions/$transactionId"
              }
            >
              {transaction.name}
            </Link>
            {transaction.pending ? (
              <span className="rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary">
                Pending
              </span>
            ) : null}
            {transaction.transfer ? (
              <TransactionTransferMatch bootstrap={bootstrap} transfer={transaction.transfer} />
            ) : null}
            {badges}
            {columns.tags && transaction.tags.length > 0 ? (
              <span className="min-w-0 max-w-1/2 md:hidden">
                <TransactionTags transaction={transaction} bootstrap={bootstrap} />
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-secondary">
            {transaction.merchant && columns.merchant ? (
              <MerchantMenu
                categoryId={transaction.category?.id}
                categoryName={transaction.category?.name}
                merchantId={transaction.merchant.id}
                merchantName={transaction.merchant.name}
                onAddFilter={onAddMerchantFilter}
                transactionId={transaction.id}
              />
            ) : null}
            <Link
              className="truncate hover:underline"
              params={{ accountId: transaction.account.id }}
              to="/accounts/$accountId"
            >
              {transaction.account.name}
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-2 md:col-span-3 md:flex">
        {category ??
          (categories !== undefined ? (
            <CategoryMenu bootstrap={bootstrap} categories={categories} transaction={transaction} />
          ) : (
            <CategoryBadge category={transaction.category ?? { name: categoryName }} />
          ))}
      </div>

      {columns.tags ? (
        <div className="hidden min-w-0 md:col-span-2 md:block">
          <TransactionTags transaction={transaction} bootstrap={bootstrap} />
        </div>
      ) : null}

      <p
        className={`privacy-sensitive text-right text-sm font-medium tabular-nums md:col-span-2 ${
          (positive ?? transaction.signed_amount_cents > 0) ? "text-success" : "text-primary"
        }`}
      >
        {amount ?? transaction.amount}
      </p>
    </li>
  );
}

function TransactionTags({
  transaction,
  bootstrap,
}: {
  transaction: SpaTransaction;
  bootstrap: SpaBootstrap;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (tagIds: SpaTransaction["tags"][number]["id"][]) =>
      updateTransaction(bootstrap.apiPaths.transactions, transaction.id, {
        tag_ids: tagIds,
      }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(
        ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
        detail,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
      ]);
    },
  });
  const tags = transaction.tags.toSorted((left, right) => left.name.localeCompare(right.name));
  const tagNames = tags.map((tag) => tag.name).join(", ");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLSpanElement>(null);
  useDismiss(
    overflowRef,
    () => {
      setOverflowOpen(false);
    },
    overflowOpen,
  );
  const visibleTags = tags.slice(0, 2);
  const hiddenTags = tags.slice(2);
  return (
    <TagSelect
      bootstrap={bootstrap}
      disabled={save.isPending}
      error={save.error?.message}
      initialTags={tags}
      onSelect={(tagIds) => {
        save.mutate(tagIds);
      }}
      selectedTagIds={tags.map((tag) => tag.id)}
      triggerLabel={tags.length > 0 ? `Edit tags: ${tagNames}` : "Add tags"}
      trigger={
        <span
          className={`flex max-w-full min-w-0 flex-nowrap items-center gap-1 ${
            tags.length === 0 ? "size-7 justify-center text-secondary hover:bg-container-inset" : ""
          }`}
          title={tags.length > 0 ? tagNames : "Add tags"}
        >
          {tags.length === 0 ? (
            <Icon name="tag" size="sm" />
          ) : (
            <>
              <span className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                {visibleTags.map((tag) => (
                  <span
                    className="shrink-0 rounded-full border border-secondary bg-container-inset px-2 py-1 text-sm font-medium leading-none whitespace-nowrap text-primary"
                    key={tag.id}
                    style={
                      tag.color
                        ? {
                            backgroundColor: `color-mix(in oklab, ${tag.color} 10%, transparent)`,
                            borderColor: `color-mix(in oklab, ${tag.color} 20%, transparent)`,
                            color: tag.color,
                          }
                        : undefined
                    }
                  >
                    {tag.name}
                  </span>
                ))}
              </span>
              {hiddenTags.length > 0 ? (
                <span className="relative inline-flex shrink-0" ref={overflowRef}>
                  <button
                    aria-expanded={overflowOpen}
                    aria-label={`Show ${hiddenTags.length} more tags: ${hiddenTags.map((tag) => tag.name).join(", ")}`}
                    className="focus-ring shrink-0 cursor-pointer rounded-full bg-container-inset px-2 py-1 text-xs font-medium text-secondary hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOverflowOpen((value) => !value);
                    }}
                    type="button"
                  >
                    +{hiddenTags.length}
                  </button>
                  {overflowOpen ? (
                    <span className="shadow-border-lg absolute top-full left-0 z-50 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-lg bg-container p-1.5">
                      {hiddenTags.map((tag) => (
                        <span
                          className="min-w-0 truncate rounded-full border border-secondary bg-container-inset px-2 py-1 text-sm font-medium leading-none text-primary"
                          key={tag.id}
                          style={
                            tag.color
                              ? {
                                  backgroundColor: `color-mix(in oklab, ${tag.color} 10%, transparent)`,
                                  borderColor: `color-mix(in oklab, ${tag.color} 20%, transparent)`,
                                  color: tag.color,
                                }
                              : undefined
                          }
                        >
                          {tag.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </>
          )}
        </span>
      }
    />
  );
}

export function CategoryBadge({
  category,
  title,
}: {
  category?: { color?: string; icon?: string; name: string } | null;
  title?: string;
}) {
  const customColor =
    typeof category?.color === "string" && category.color.startsWith("#")
      ? category.color
      : "#737373";
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-sm font-medium leading-none align-middle"
      style={{
        backgroundColor: `color-mix(in oklab, ${customColor} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${customColor} 20%, transparent)`,
        color: customColor,
      }}
      title={title ?? category?.name}
    >
      <CategoryIcon className="size-4 shrink-0" name={category?.icon} />
      <span className="min-w-0 truncate">{category?.name ?? "Uncategorized"}</span>
    </span>
  );
}

function CategoryMenu({
  bootstrap,
  categories,
  transaction,
}: {
  bootstrap: SpaBootstrap;
  categories: ReferenceOption<CategoryId>[];
  transaction: SpaTransaction;
}) {
  const queryClient = useQueryClient();
  const [loadRecent, setLoadRecent] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"categories" | "match">("categories");
  const recentQuery = useQuery({
    ...recentCategoriesQueryOptions(bootstrap.apiPaths.categories),
    enabled: loadRecent,
  });
  const candidatesQuery = useQuery({
    ...transferMatchCandidatesQueryOptions(bootstrap.apiPaths.transactions, transaction.id),
    enabled: loadRecent && view === "match",
  });
  const categorySave = useMutation({
    mutationFn: (input: NonNullable<TransactionUpdateInput>) =>
      updateTransaction(bootstrap.apiPaths.transactions, transaction.id, input),
    onSuccess: async (detail) => {
      queryClient.setQueryData(
        ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
        detail,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
        queryClient.invalidateQueries({
          queryKey: ["spa", "reference", "recent-categories"],
        }),
      ]);
    },
  });
  const transferMatch = useMutation({
    mutationFn: async (counterpartId: TransactionId) => {
      const counterpart = await queryClient.query(
        transactionDetailQueryOptions(bootstrap.apiPaths.transactions, counterpartId),
      );
      return createTransferMatch(bootstrap.apiPaths.transactions, transaction.id, {
        method: "existing",
        matched_entry_id: counterpart.entry_id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
    },
  });
  const groups = useMemo(() => categoryGroups(categories), [categories]);
  const lowerQuery = query.trim().toLowerCase();
  const options: PickerOption[] = [];
  const counterparts = (candidatesQuery.data?.candidates ?? []).map((candidate) => ({
    candidate,
    transaction:
      candidate.outflow_transaction_id === transaction.id
        ? candidate.inflow_transaction
        : candidate.outflow_transaction,
  }));
  if (view === "match") {
    options.push({
      value: "__back",
      label: "Back to categories",
      keepOpen: true,
    });
    for (const counterpart of counterparts) {
      if (
        !`${counterpart.transaction.name} ${counterpart.transaction.account.name}`
          .toLowerCase()
          .includes(lowerQuery)
      )
        continue;
      options.push({
        value: counterpart.transaction.id,
        label: counterpart.transaction.name,
        content: (
          <span className="min-w-0">
            <span className="block truncate font-medium">{counterpart.transaction.name}</span>
            <span className="block truncate text-xs text-secondary">
              {counterpart.transaction.account.name} · {counterpart.transaction.date} ·{" "}
              {counterpart.transaction.amount}
              {counterpart.candidate.date_diff > 0
                ? ` · ${counterpart.candidate.date_diff}d apart`
                : ""}
            </span>
          </span>
        ),
      });
    }
  } else {
    if (lowerQuery.length === 0) {
      for (const recent of recentQuery.data ?? []) {
        if (recent.id === transaction.category?.id) continue;
        options.push({
          value: recent.id,
          key: `recent-${recent.id}`,
          label: recent.name,
          group: "Recent",
          content: <CategoryBadge category={recent} />,
        });
      }
    }
    for (const group of groups) {
      const parentMatches = group.category.name.toLowerCase().includes(lowerQuery);
      if ((group.subcategories.length === 0 || lowerQuery.length > 0) && parentMatches) {
        options.push({
          value: group.category.id,
          label: group.category.name,
          group: "Categories",
          content: <CategoryBadge category={group.category} />,
        });
      }
      for (const category of group.subcategories) {
        if (!parentMatches && !category.name.toLowerCase().includes(lowerQuery)) continue;
        options.push({
          value: category.id,
          label: category.name,
          group: "Categories",
          content: (
            <>
              <Icon name="corner-down-right" size="sm" />
              <CategoryBadge category={category} />
            </>
          ),
        });
      }
    }
    if (transaction.category)
      options.push({ value: "__clear", label: "Clear category", group: "Actions" });
    if (!transaction.transfer) {
      options.push({
        value: "__match",
        label: "Match transfer/payment",
        group: "Actions",
        keepOpen: true,
      });
    }
  }
  return (
    <SearchablePicker
      disabled={categorySave.isPending || transferMatch.isPending}
      error={
        categorySave.error?.message ??
        transferMatch.error?.message ??
        (view === "match" ? candidatesQuery.error?.message : undefined)
      }
      inline
      label="Category"
      loading={view === "match" && candidatesQuery.isPending}
      onOpen={() => {
        setLoadRecent(true);
        setView("categories");
      }}
      onQueryChange={setQuery}
      onSelect={async (value) => {
        if (value === "__match" || value === "__back") {
          setView(value === "__match" ? "match" : "categories");
          setQuery("");
          return false;
        }
        try {
          if (view === "match") {
            const counterpart = counterparts.find(
              (candidate) => candidate.transaction.id === value,
            );
            if (counterpart === undefined) return false;
            await transferMatch.mutateAsync(counterpart.transaction.id);
          } else if (value === "__clear") await categorySave.mutateAsync({ category_id: null });
          else {
            const category =
              categories.find((candidate) => candidate.id === value) ??
              recentQuery.data?.find((candidate) => candidate.id === value);
            if (category === undefined) return false;
            await categorySave.mutateAsync({ category_id: category.id });
          }
          return true;
        } catch {
          // Keep the picker open; the mutation's error is displayed above.
          return false;
        }
      }}
      options={options}
      query={query}
      searchLabel={view === "match" ? "Search possible matches" : "Search categories"}
      selectedValues={
        view === "categories" && transaction.category ? [transaction.category.id] : []
      }
      trigger={
        <CategoryBadge
          category={
            transaction.category ?? {
              color: "var(--utility-text-secondary)",
              icon: "shapes",
              name: transaction.classification === "income" ? "Income" : "Uncategorized",
            }
          }
        />
      }
      footer={
        <div className="mt-2 border-t border-tertiary pt-2">
          <Link
            className="focus-ring flex items-center gap-2 rounded-lg p-2 text-sm text-secondary hover:bg-container-inset-hover"
            params={{ transactionId: transaction.id }}
            to="/transactions/$transactionId/split/new"
          >
            <Icon name="split" size="sm" />
            Split
          </Link>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm text-secondary hover:bg-container-inset-hover">
            <input
              checked={transaction.excluded}
              className="checkbox checkbox--light"
              disabled={categorySave.isPending}
              onChange={() => {
                categorySave.mutate({ excluded: !transaction.excluded });
              }}
              type="checkbox"
            />
            {transaction.signed_amount_cents > 0 ? "One-time income" : "One-time expense"}
            <Icon className="ml-auto text-warning" name="asterisk" size="sm" />
          </label>
        </div>
      }
    />
  );
}

function categoryGroups(categories: ReferenceOption<CategoryId>[]): {
  category: ReferenceOption<CategoryId>;
  subcategories: ReferenceOption<CategoryId>[];
}[] {
  const byParentName = new Map<string, ReferenceOption<CategoryId>[]>();
  for (const category of categories) {
    const key = category.parentName ?? "";
    const list = byParentName.get(key) ?? [];
    list.push(category);
    byParentName.set(key, list);
  }

  const roots = (byParentName.get("") ?? []).toSorted((a, b) => a.name.localeCompare(b.name));
  return roots.map((root) => ({
    category: root,
    subcategories: (byParentName.get(root.name) ?? []).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }));
}

function TransactionTransferMatch({
  bootstrap,
  transfer,
}: {
  bootstrap: SpaBootstrap;
  transfer: NonNullable<SpaTransaction["transfer"]>;
}) {
  const queryClient = useQueryClient();
  const text = bootstrap.transactionTransferMatchText;
  const decide = useMutation({
    mutationFn: (status: "confirmed" | "rejected") =>
      updateTransferStatus(bootstrap.apiPaths.transfers, transfer.id, {
        status,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
      ]);
    },
  });

  if (transfer.status === "confirmed") {
    return (
      <span aria-label={text.transfer_confirmed} title={text.transfer_confirmed}>
        <Icon name="link-2" size="sm" />
      </span>
    );
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1">
      <span className="shrink-0 rounded-full bg-container-inset px-2 py-0.5 text-xs font-medium text-secondary">
        <span className="hidden lg:inline">{text.auto_matched}</span>
        <span className="lg:hidden" title={text.auto_matched}>
          {text.auto_matched_short}
        </span>
      </span>
      <IconButton
        disabled={decide.isPending}
        icon="check"
        label={text.confirm_match}
        onClick={() => {
          decide.mutate("confirmed");
        }}
        size="sm"
      />
      <IconButton
        disabled={decide.isPending}
        icon="x"
        label={text.reject_match}
        onClick={() => {
          decide.mutate("rejected");
        }}
        size="sm"
      />
      {decide.error ? (
        <span className="basis-full text-xs text-destructive" role="alert">
          {decide.error.message}
        </span>
      ) : null}
    </div>
  );
}

function MerchantMenu({
  categoryId,
  categoryName,
  merchantId,
  merchantName,
  onAddFilter,
  transactionId,
}: {
  categoryId?: CategoryId;
  categoryName?: string;
  merchantId: MerchantId;
  merchantName: string;
  onAddFilter?: (merchantName: string) => void;
  transactionId?: TransactionId;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismiss(
    containerRef,
    () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
    open,
  );

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (!open || !menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const activeElement = document.activeElement;
    const currentIndex = activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      items[prevIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const ruleSearch: Record<string, string> = {
    resource_type: "transaction",
    merchant_id: merchantId,
    action_type: "set_transaction_category",
  };
  // Uncategorized transactions omit :action_value so the rule form opens with
  // "Set transaction category" and an empty category for the user to pick.
  if (categoryId !== undefined && categoryId.length > 0) ruleSearch.action_value = categoryId;

  const testId =
    transactionId !== undefined && transactionId.length > 0
      ? `merchant-rule-menu-${transactionId}-desktop`
      : undefined;

  return (
    <span className="inline-flex min-w-0 items-center gap-1" ref={containerRef}>
      <span className="relative inline-flex min-w-0" data-testid={testId}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Options for merchant ${merchantName}`}
          className="focus-ring flex max-w-full min-w-0 cursor-pointer rounded-sm text-secondary hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            if (!open && buttonRef.current) {
              const buttonRect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - buttonRect.bottom;
              setPlacement(spaceBelow < 180 && buttonRect.top > 180 ? "top" : "bottom");
            }
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !open) {
              event.preventDefault();
              if (buttonRef.current) {
                const buttonRect = buttonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - buttonRect.bottom;
                setPlacement(spaceBelow < 180 && buttonRect.top > 180 ? "top" : "bottom");
              }
              setOpen(true);
            }
          }}
          ref={buttonRef}
          type="button"
        >
          <span className="truncate">{merchantName}</span>
        </button>
        {open ? (
          <div
            aria-label={`Options for merchant ${merchantName}`}
            className={`shadow-border-lg absolute left-0 z-50 min-w-[200px] max-w-72 whitespace-normal rounded-lg bg-container py-1 ${
              placement === "top" ? "bottom-full mb-1" : "top-full mt-1"
            }`}
            data-testid={testId}
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
            tabIndex={-1}
          >
            <div className="px-1" role="none">
              <Link
                className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
                role="menuitem"
                search={{ merchants: [merchantName], page: 1 }}
                tabIndex={0}
                to="/transactions"
              >
                <Icon name="receipt-text" size="sm" />
                <span className="min-w-0 wrap-break-word text-sm text-primary">
                  View {merchantName} transactions
                </span>
              </Link>
            </div>
            {onAddFilter !== undefined ? (
              <div className="px-1" role="none">
                <button
                  className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onAddFilter(merchantName);
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  type="button"
                >
                  <Icon name="plus" size="sm" />
                  <span className="min-w-0 wrap-break-word text-sm text-primary">
                    Add to current filters
                  </span>
                </button>
              </div>
            ) : null}
            <div className="px-1" role="none">
              <Link
                className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
                params={{ merchantId }}
                role="menuitem"
                search={{ return_to: currentReturnTo() }}
                tabIndex={-1}
                to="/family_merchants/$merchantId/edit"
              >
                <Icon name="pencil" size="sm" />
                <span className="min-w-0 wrap-break-word text-sm text-primary">
                  Edit {merchantName}
                </span>
              </Link>
            </div>
            <div className="px-1" role="none">
              <Link
                className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
                role="menuitem"
                search={{ ...ruleSearch, return_to: currentReturnTo() }}
                tabIndex={-1}
                to="/rules/new"
              >
                <Icon name="plus" size="sm" />
                <span className="min-w-0 wrap-break-word text-sm text-primary">
                  {categoryName !== undefined && categoryName.length > 0
                    ? `Always categorize ${merchantName} as ${categoryName}`
                    : `Always categorize ${merchantName}`}
                </span>
              </Link>
            </div>
          </div>
        ) : null}
      </span>
      <span aria-hidden="true" className="shrink-0 text-secondary">
        •
      </span>
    </span>
  );
}
