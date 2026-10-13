/* eslint-disable import/max-dependencies -- Transaction forms compose shared controls, API operations, and drawer navigation. */
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { CategoryIcon, Icon } from "./icon";
import { Modal } from "./modal";
import { Toggle } from "./components/toggle";
import { TagSelect } from "./components/tag-select";
import { SearchablePicker, type PickerOption } from "./components/searchable-picker";
import { BrandLogo } from "./components/brand-logo";
import {
  TransactionApiError,
  createCategory,
  createMerchant,
  createTransferMatch,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  transferMatchCandidatesQueryOptions,
  updateTransaction,
  updateTransferStatus,
  type ReferenceOption,
  type SpaTransactionDetail,
  type TransactionUpdateInput,
} from "./api/transactions";
import {
  AccountIdSchema,
  TransactionIdSchema,
  type CategoryId,
  type TransactionId,
  type MerchantId,
  type TagId,
} from "./ids";
import type { SpaBootstrap } from "./bootstrap";

export type Bootstrap = Pick<SpaBootstrap, "apiPaths" | "railsPaths">;

type SaveState = "idle" | "saving" | "error";

function formatLongDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TransactionDetailDrawer() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const transactionId = TransactionIdSchema.parse(params.transactionId);
  const accountId =
    params.accountId !== undefined ? AccountIdSchema.parse(params.accountId) : undefined;
  const navigate = useNavigate();
  const detailQuery = useQuery(
    transactionDetailQueryOptions(bootstrap.apiPaths.transactions, transactionId),
  );
  const transaction = detailQuery.data;
  const error = detailQuery.error
    ? detailQuery.error instanceof TransactionApiError
      ? detailQuery.error.message
      : "Transaction data did not match the API contract."
    : undefined;

  function close() {
    if (accountId) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId },
        search: (previous) => previous,
        resetScroll: false,
      });
    } else void navigate({ to: "/transactions", resetScroll: false });
  }

  return (
    <Modal
      ariaLabelledby="transaction-detail-title"
      onClose={close}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-container p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        {error !== undefined ? (
          <div className="rounded-xl border border-destructive bg-container p-5" role="alert">
            <p className="font-medium text-primary">Transaction unavailable</p>
            <p className="mt-1 text-sm text-secondary">{error}</p>
            <div className="mt-4 flex items-center gap-3">
              <button
                className="text-sm font-medium text-link hover:underline"
                onClick={() => void detailQuery.refetch()}
                type="button"
              >
                Try again
              </button>
              <button
                className="text-sm font-medium text-link hover:underline"
                onClick={close}
                type="button"
              >
                {accountId ? bootstrap.accountDetailText.close : "Back to transactions"}
              </button>
            </div>
          </div>
        ) : transaction === undefined ? (
          <TransactionDetailSkeleton />
        ) : (
          <>
            <TransactionDetailHeader transaction={transaction} onClose={close} />
            {transaction.transfer ? (
              <TransactionDetailTransfer bootstrap={bootstrap} transaction={transaction} />
            ) : null}
            <TransactionEditableForm bootstrap={bootstrap} transaction={transaction} />
            {!transaction.transfer && !transaction.pending ? (
              <TransferMatcher bootstrap={bootstrap} transaction={transaction} />
            ) : null}
            <TransactionDetailBody bootstrap={bootstrap} transaction={transaction} />
            <TransactionDetailMeta transaction={transaction} />
          </>
        )}
      </div>
    </Modal>
  );
}

function TransactionDetailHeader({
  transaction,
  onClose,
}: {
  transaction: SpaTransactionDetail;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="flex items-center gap-2 text-2xl font-medium privacy-sensitive"
            id="transaction-detail-title"
          >
            {transaction.amount}
            <span className="text-lg font-normal text-secondary">{transaction.currency}</span>
            {transaction.transfer ? (
              <Icon name="arrow-left-right" className="text-secondary" />
            ) : null}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-primary">{transaction.name}</span>
            <span className="text-sm text-secondary">•</span>
            <span className="text-sm text-secondary">{formatLongDate(transaction.date)}</span>
            {transaction.pending ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary"
                title="This transaction is still pending at the provider"
              >
                <Icon name="clock" />
                Pending
              </span>
            ) : null}
          </div>
        </div>
        <button
          aria-label="Close"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-container-hover hover:text-primary"
          onClick={onClose}
          type="button"
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen ?? title === "Overview"}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium uppercase text-secondary">{title}</span>
        <Icon
          className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
          name="chevron-down"
        />
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="text-sm text-primary">{value}</dd>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <output aria-live="polite" className="text-xs text-secondary">
        <span className="inline-flex items-center gap-1">
          <Icon className="animate-spin" name="loader-circle" />
          Saving…
        </span>
      </output>
    );
  }
  return (
    <output aria-live="polite" className="text-xs text-destructive">
      <span className="inline-flex items-center gap-1">
        <Icon name="circle-alert" />
        Save failed
      </span>
    </output>
  );
}

function CategoryPill({ name, color, icon }: { name: string; color?: string; icon?: string }) {
  const customColor = typeof color === "string" && color.startsWith("#") ? color : "#737373";
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-sm font-medium leading-none align-middle"
      style={{
        backgroundColor: `color-mix(in oklab, ${customColor} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${customColor} 20%, transparent)`,
        color: customColor,
      }}
    >
      <CategoryIcon className="size-4 shrink-0" name={icon} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function MerchantAvatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <BrandLogo
      className="size-6 rounded-full border text-xs font-medium uppercase"
      src={logoUrl}
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-gray-500) 10%, transparent)",
        borderColor: "color-mix(in oklab, var(--color-gray-500) 20%, transparent)",
        color: "var(--color-gray-500)",
      }}
    >
      {name.charAt(0)}
    </BrandLogo>
  );
}

export function CategorySelect({
  bootstrap,
  categories,
  disabled,
  initialCategory,
  onSelect,
  selectedCategoryId,
}: {
  bootstrap: Bootstrap;
  categories: ReferenceOption<CategoryId>[];
  disabled?: boolean;
  initialCategory?: { id: CategoryId; name: string; color: string; icon: string } | null;
  onSelect: (categoryId: CategoryId | "") => void;
  selectedCategoryId: CategoryId | "";
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const selected =
    categories.find((category) => category.id === selectedCategoryId) ??
    (initialCategory?.id === selectedCategoryId ? initialCategory : undefined);
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const options: PickerOption[] = [
    { value: "", label: "(uncategorized)" },
    ...categories
      .filter((category) => category.name.toLowerCase().includes(lowerQuery))
      .map((category) => ({
        value: category.id,
        label: category.name,
        content: <CategoryPill color={category.color} icon={category.icon} name={category.name} />,
      })),
  ];
  if (
    trimmedQuery.length > 0 &&
    !categories.some((category) => category.name.toLowerCase() === lowerQuery)
  )
    options.push({ value: "__create", label: `Create "${trimmedQuery}"` });

  async function handleCreate() {
    if (isCreating || disabled === true) return false;
    setIsCreating(true);
    setCreateError(undefined);
    try {
      const category = await createCategory(bootstrap.apiPaths.categories, trimmedQuery);
      queryClient.setQueriesData<{ categories: ReferenceOption<CategoryId>[] }>(
        {
          queryKey: [
            "spa",
            "reference",
            bootstrap.apiPaths.categories,
            bootstrap.apiPaths.merchants,
            bootstrap.apiPaths.tags,
          ],
        },
        (old) =>
          old
            ? {
                ...old,
                categories: [...old.categories, category].toSorted((left, right) =>
                  left.name.localeCompare(right.name),
                ),
              }
            : old,
      );
      onSelect(category.id);
      return true;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create category");
      return false;
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <SearchablePicker
      disabled={disabled === true || isCreating}
      error={createError}
      label="Category"
      onQueryChange={(value) => {
        setQuery(value);
        setCreateError(undefined);
      }}
      onSelect={(value) => {
        if (value === "__create") return handleCreate();
        if (value === "") {
          onSelect("");
          return true;
        }
        const category = categories.find((candidate) => candidate.id === value);
        if (category === undefined) return false;
        onSelect(category.id);
        return true;
      }}
      options={options}
      query={query}
      searchLabel="Search categories"
      selectedValues={[selectedCategoryId]}
      trigger={
        selected ? (
          <CategoryPill color={selected.color} icon={selected.icon} name={selected.name} />
        ) : (
          <span className="text-sm text-secondary">Select a Category</span>
        )
      }
    />
  );
}

export function MerchantSelect({
  bootstrap,
  disabled,
  initialMerchant,
  merchants,
  onSelect,
  selectedMerchantId,
}: {
  bootstrap: Bootstrap;
  disabled?: boolean;
  initialMerchant?: { id: MerchantId; name: string; logo_url?: string | null } | null;
  merchants: ReferenceOption<MerchantId>[];
  onSelect: (merchantId: MerchantId | "") => void;
  selectedMerchantId: MerchantId | "";
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const selected =
    merchants.find((merchant) => merchant.id === selectedMerchantId) ??
    (initialMerchant?.id === selectedMerchantId
      ? {
          ...initialMerchant,
          logoUrl: initialMerchant.logo_url ?? undefined,
        }
      : undefined);
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const options: PickerOption[] = [
    { value: "", label: "No merchant" },
    ...merchants
      .filter((merchant) => merchant.name.toLowerCase().includes(lowerQuery))
      .map((merchant) => ({
        value: merchant.id,
        label: merchant.name,
        content: (
          <>
            <MerchantAvatar logoUrl={merchant.logoUrl} name={merchant.name} />
            <span className="truncate">{merchant.name}</span>
          </>
        ),
      })),
  ];
  if (
    trimmedQuery.length > 0 &&
    !merchants.some((merchant) => merchant.name.toLowerCase() === lowerQuery)
  )
    options.push({ value: "__create", label: `Create "${trimmedQuery}"` });

  async function handleCreate() {
    if (isCreating || disabled === true) return false;
    setIsCreating(true);
    setCreateError(undefined);
    try {
      const merchant = await createMerchant(bootstrap.apiPaths.merchants, trimmedQuery);
      queryClient.setQueriesData<{ merchants: ReferenceOption<MerchantId>[] }>(
        {
          queryKey: [
            "spa",
            "reference",
            bootstrap.apiPaths.categories,
            bootstrap.apiPaths.merchants,
            bootstrap.apiPaths.tags,
          ],
        },
        (old) =>
          old
            ? {
                ...old,
                merchants: [...old.merchants, merchant].toSorted((left, right) =>
                  left.name.localeCompare(right.name),
                ),
              }
            : old,
      );
      onSelect(merchant.id);
      return true;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create merchant");
      return false;
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <SearchablePicker
      disabled={disabled === true || isCreating}
      error={createError}
      label="Merchant"
      onQueryChange={(value) => {
        setQuery(value);
        setCreateError(undefined);
      }}
      onSelect={(value) => {
        if (value === "__create") return handleCreate();
        if (value === "") {
          onSelect("");
          return true;
        }
        const merchant = merchants.find((candidate) => candidate.id === value);
        if (merchant === undefined) return false;
        onSelect(merchant.id);
        return true;
      }}
      options={options}
      query={query}
      searchLabel="Search merchants"
      selectedValues={[selectedMerchantId]}
      trigger={
        selected ? (
          <span className="flex items-center gap-2 truncate">
            <MerchantAvatar logoUrl={selected.logoUrl} name={selected.name} />
            <span className="truncate text-sm text-primary">{selected.name}</span>
          </span>
        ) : (
          <span className="text-sm text-secondary">No merchant</span>
        )
      }
    />
  );
}

function TransactionEditableForm({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
    ),
  );

  const save = useMutation({
    mutationFn: (input: NonNullable<TransactionUpdateInput>) =>
      updateTransaction(bootstrap.apiPaths.transactions, transaction.id, input),
    onError: () => {
      setSaveState("error");
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(
        ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
        detail,
      );
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "summary"] });
      setSaveState("idle");
    },
  });
  const defaultValues: {
    category_id: CategoryId | "";
    date: string;
    excluded: boolean;
    merchant_id: MerchantId | "";
    name: string;
    notes: string;
    tag_ids: TagId[];
  } = {
    category_id: transaction.category?.id ?? "",
    date: transaction.date,
    excluded: transaction.excluded,
    merchant_id: transaction.merchant?.id ?? "",
    name: transaction.name,
    notes: transaction.notes ?? "",
    tag_ids: transaction.tags.map((tag) => tag.id),
  };

  const form = useForm({
    defaultValues,
  });

  function saveField<K extends keyof NonNullable<TransactionUpdateInput>>(
    field: K,
    value: NonNullable<TransactionUpdateInput>[K],
    baseline: unknown,
  ) {
    if (value === baseline) return;
    setSaveState("saving");
    save.mutate({ [field]: value });
  }

  const categories = referenceQuery.data?.categories ?? [];
  const merchants = referenceQuery.data?.merchants ?? [];
  const tags = referenceQuery.data?.tags ?? [];

  return (
    <Section title="Overview">
      <div className="space-y-2">
        <form.Field name="name">
          {(field) => (
            <div className="form-field">
              <div className="form-field__body">
                <label className="form-field__label" htmlFor="txn-name">
                  Name
                </label>
                <input
                  autoComplete="off"
                  className="form-field__input"
                  disabled={save.isPending}
                  id="txn-name"
                  onBlur={() => {
                    saveField("name", field.state.value, transaction.name);
                  }}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                  }}
                  placeholder="Transaction name"
                  type="text"
                  value={field.state.value}
                />
              </div>
            </div>
          )}
        </form.Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <form.Field name="date">
            {(field) => (
              <div className="form-field">
                <div className="form-field__body">
                  <label className="form-field__label" htmlFor="txn-date">
                    Date
                  </label>
                  <input
                    className="form-field__input"
                    disabled={save.isPending}
                    id="txn-date"
                    onBlur={() => {
                      saveField("date", field.state.value, transaction.date);
                    }}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                    }}
                    type="date"
                    value={field.state.value}
                  />
                </div>
              </div>
            )}
          </form.Field>
          <form.Field name="merchant_id">
            {(field) => (
              <MerchantSelect
                bootstrap={bootstrap}
                disabled={save.isPending}
                initialMerchant={transaction.merchant}
                merchants={merchants}
                onSelect={(merchantId) => {
                  field.handleChange(merchantId);
                  saveField(
                    "merchant_id",
                    merchantId === "" ? null : merchantId,
                    transaction.merchant?.id ?? "",
                  );
                }}
                selectedMerchantId={field.state.value}
              />
            )}
          </form.Field>
        </div>
        <form.Field name="category_id">
          {(field) => (
            <CategorySelect
              bootstrap={bootstrap}
              categories={categories}
              disabled={save.isPending}
              initialCategory={transaction.category}
              onSelect={(categoryId) => {
                field.handleChange(categoryId);
                saveField(
                  "category_id",
                  categoryId === "" ? null : categoryId,
                  transaction.category?.id ?? "",
                );
              }}
              selectedCategoryId={field.state.value}
            />
          )}
        </form.Field>
        <form.Field name="tag_ids">
          {(field) => (
            <TagSelect
              bootstrap={bootstrap}
              disabled={save.isPending}
              initialTags={transaction.tags}
              onSelect={(tagIds) => {
                field.handleChange(tagIds);
                saveField(
                  "tag_ids",
                  tagIds,
                  transaction.tags.map((t) => t.id),
                );
              }}
              selectedTagIds={field.state.value}
              tags={tags}
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <div className="form-field">
              <div className="form-field__body">
                <label className="form-field__label" htmlFor="txn-notes">
                  Note
                </label>
                <textarea
                  className="form-field__input"
                  disabled={save.isPending}
                  id="txn-notes"
                  onBlur={() => {
                    saveField("notes", field.state.value, transaction.notes ?? "");
                  }}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                  }}
                  placeholder="Add a note..."
                  rows={2}
                  value={field.state.value}
                />
              </div>
            </div>
          )}
        </form.Field>
        <form.Field name="excluded">
          {(field) => (
            <div className="form-field">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <label className="form-field__label cursor-pointer" htmlFor="txn-excluded">
                    Exclude from reports
                  </label>
                  <p className="text-xs text-secondary">
                    Hidden from budgets, cash flow, and reports
                  </p>
                </div>
                <Toggle
                  checked={field.state.value}
                  disabled={save.isPending}
                  id="txn-excluded"
                  onChange={(next) => {
                    field.handleChange(next);
                    saveField("excluded", next, transaction.excluded);
                  }}
                />
              </div>
            </div>
          )}
        </form.Field>
        <div className="flex justify-end pt-1">
          <SaveIndicator state={saveState} />
        </div>
      </div>
    </Section>
  );
}

function TransferMatcher({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [matcherError, setMatcherError] = useState<string | null>(null);
  const candidatesQuery = useQuery(
    transferMatchCandidatesQueryOptions(bootstrap.apiPaths.transactions, transaction.id),
  );

  const match = useMutation({
    mutationFn: async (counterpartId: TransactionId) => {
      const counterpart = await queryClient.query(
        transactionDetailQueryOptions(bootstrap.apiPaths.transactions, counterpartId),
      );
      return createTransferMatch(bootstrap.apiPaths.transactions, transaction.id, {
        method: "existing",
        matched_entry_id: counterpart.entry_id,
      });
    },
    onError: (error) => {
      setMatcherError(error instanceof TransactionApiError ? error.message : "Match failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
    },
  });

  const candidates = candidatesQuery.data?.candidates ?? [];

  return (
    <Section title="Match transfer">
      {matcherError !== null ? (
        <p
          className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {matcherError}
        </p>
      ) : null}
      {candidatesQuery.isLoading ? (
        <p className="text-sm text-secondary">Looking for possible matches…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-secondary">No possible matches found.</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => {
            const counterpart =
              candidate.outflow_transaction_id === transaction.id
                ? candidate.inflow_transaction
                : candidate.outflow_transaction;
            return (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border border-tertiary px-3 py-2"
                key={`${candidate.inflow_transaction_id}-${candidate.outflow_transaction_id}`}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium text-primary">{counterpart.name}</p>
                  <p className="text-xs text-secondary">
                    {counterpart.account.name} · {counterpart.date} · {counterpart.amount}
                    {candidate.date_diff > 0 ? ` · ${candidate.date_diff}d apart` : ""}
                  </p>
                </div>
                <button
                  className="focus-ring shrink-0 rounded-lg button-bg-primary px-2.5 py-1 text-xs font-medium text-inverse disabled:opacity-50"
                  disabled={match.isPending}
                  onClick={() => {
                    match.mutate(counterpart.id);
                  }}
                  type="button"
                >
                  Match
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function TransactionDetailTransfer({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const transfer = transaction.transfer;
  const transferId = transfer?.id ?? null;
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
  };

  const decide = useMutation({
    mutationFn: async (status: "confirmed" | "rejected") => {
      if (transferId === null) throw new TransactionApiError("Transfer missing", 0);
      await updateTransferStatus(bootstrap.apiPaths.transfers, transferId, { status });
    },
    onSuccess: invalidate,
  });

  if (!transfer) return null;

  return (
    <Section title="Matching transfer">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1 text-sm">
          <h3 className="font-medium text-primary">{transfer.other_account?.name ?? "Transfer"}</h3>
          <p className="text-secondary">
            {transfer.amount} {transfer.currency}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary">
            <Icon name="arrow-left-right" />
            {transfer.status === "pending" ? "Pending match" : "Matched"}
          </span>
          {transfer.status === "pending" ? (
            <span className="flex gap-1.5">
              <button
                className="focus-ring rounded-lg button-bg-primary px-2.5 py-1 text-xs font-medium text-inverse disabled:opacity-50"
                disabled={decide.isPending}
                onClick={() => {
                  decide.mutate("confirmed");
                }}
                type="button"
              >
                Keep match
              </button>
              <button
                className="focus-ring rounded-lg border border-secondary px-2.5 py-1 text-xs font-medium text-secondary disabled:opacity-50"
                disabled={decide.isPending}
                onClick={() => {
                  decide.mutate("rejected");
                }}
                type="button"
              >
                Reject
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function TransactionDetailBody({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  return (
    <Section title="Details">
      <dl className="space-y-3">
        <Field label="Account" value={transaction.account.name} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-secondary">Merchant</dt>
            <dd className="text-sm text-primary">
              {transaction.merchant ? (
                <MerchantLinks bootstrap={bootstrap} transaction={transaction} />
              ) : (
                "None"
              )}
            </dd>
          </div>
          <Field
            label="Tags"
            value={
              transaction.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {transaction.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-container-inset px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={tag.color.length > 0 ? { backgroundColor: tag.color } : undefined}
                      />
                      {tag.name}
                    </span>
                  ))}
                </span>
              ) : (
                "None"
              )
            }
          />
        </div>
        <Field
          label="Note"
          value={
            typeof transaction.notes === "string" && transaction.notes.length > 0
              ? transaction.notes
              : "—"
          }
        />
      </dl>
    </Section>
  );
}

function MerchantLinks({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const merchant = transaction.merchant;
  if (!merchant) return null;

  const ruleHref =
    transaction.category?.id === undefined
      ? null
      : `${bootstrap.railsPaths.newRule}?${new URLSearchParams({
          resource_type: "transaction",
          merchant_id: merchant.id,
          action_type: "set_transaction_category",
          action_value: transaction.category.id,
        }).toString()}`;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link
        className="font-medium text-link hover:underline"
        search={{ merchants: [merchant.name], page: 1 }}
        to="/transactions"
      >
        {merchant.name}
      </Link>
      <a
        className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary hover:underline"
        data-turbo-frame="modal"
        href={`${bootstrap.railsPaths.familyMerchants}/${merchant.id}/edit`}
      >
        <Icon name="pencil" size="sm" />
        Edit merchant
      </a>
      {ruleHref !== null ? (
        <a
          className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary hover:underline"
          data-turbo-frame="modal"
          href={ruleHref}
        >
          <Icon name="plus" size="sm" />
          Always categorize as {transaction.category?.name}
        </a>
      ) : null}
    </span>
  );
}

function TransactionDetailMeta({ transaction }: { transaction: SpaTransactionDetail }) {
  return (
    <Section title="Additional details">
      <dl className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status" value={transaction.pending ? "Pending" : "Posted"} />
          <Field label="Excluded" value={transaction.excluded ? "Yes" : "No"} />
        </div>
        {typeof transaction.external_id === "string" && transaction.external_id.length > 0 ? (
          <Field label="External ID" value={transaction.external_id} />
        ) : null}
        {typeof transaction.source === "string" && transaction.source.length > 0 ? (
          <Field label="Source" value={transaction.source} />
        ) : null}
        <Field
          label="Counterpart"
          value={
            transaction.transfer?.other_account
              ? `${transaction.transfer.other_account.name} · ${transaction.transfer.amount} ${transaction.transfer.currency}`
              : "—"
          }
        />
        <div className="grid grid-cols-1 gap-3 text-xs text-secondary sm:grid-cols-2">
          <span>Created {formatShortDate(transaction.created_at.slice(0, 10))}</span>
          <span>Updated {formatShortDate(transaction.updated_at.slice(0, 10))}</span>
        </div>
      </dl>
    </Section>
  );
}

function TransactionDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading transaction" className="space-y-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="animate-pulse rounded-xl bg-container p-5 shadow-border-xs">
          <div className="h-6 w-1/3 rounded-sm bg-container-inset" />
          <div className="mt-3 space-y-2">
            <div className="h-4 w-2/3 rounded-sm bg-container-inset" />
            <div className="h-4 w-1/2 rounded-sm bg-container-inset" />
          </div>
        </div>
      ))}
    </div>
  );
}
