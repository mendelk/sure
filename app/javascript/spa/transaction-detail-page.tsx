/* eslint-disable import/max-dependencies -- Transaction forms compose shared controls, API operations, and drawer navigation. */
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { CategoryIcon, Icon } from "./icon";
import { Modal } from "./modal";
import { Toggle } from "./components/toggle";
import { Button } from "./components/button";
import { IconButton } from "./components/icon-button";
import { TagSelect } from "./components/tag-select";
import { SearchablePicker, type PickerOption } from "./components/searchable-picker";
import { BrandLogo } from "./components/brand-logo";
import { currentReturnTo } from "./return-to";
import {
  TransactionApiError,
  createCategory,
  createMerchant,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  updateTransaction,
  updateTransferStatus,
  markTransactionRecurring,
  deleteTransaction,
  unlockEntry,
  mergeDuplicate,
  dismissDuplicate,
  readCsrfToken,
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
        search: true,
        resetScroll: false,
      });
    } else {
      void navigate({
        to: "/transactions",
        search: true,
        resetScroll: false,
      });
    }
  }

  return (
    <>
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
                <Button
                  className="text-sm font-medium"
                  onClick={() => {
                    void detailQuery.refetch();
                  }}
                  size="sm"
                  variant="link"
                >
                  Try again
                </Button>
                <Button className="text-sm font-medium" onClick={close} size="sm" variant="link">
                  {accountId ? bootstrap.accountDetailText.close : "Back to transactions"}
                </Button>
              </div>
            </div>
          ) : transaction === undefined ? (
            <TransactionDetailSkeleton />
          ) : (
            <>
              <TransactionDetailHeader transaction={transaction} onClose={close} />
              {transaction.permissions.can_edit ? (
                <TransactionDuplicateAlert bootstrap={bootstrap} transaction={transaction} />
              ) : null}
              <TransactionProtectionBanner bootstrap={bootstrap} transaction={transaction} />
              {transaction.transfer ? (
                <TransactionDetailTransfer bootstrap={bootstrap} transaction={transaction} />
              ) : null}
              {transaction.permissions.can_annotate &&
              (transaction.parent_entry_id ?? null) === null ? (
                <TransactionEditableForm bootstrap={bootstrap} transaction={transaction} />
              ) : null}
              <TransactionDetailBody transaction={transaction} />
              <TransactionAttachmentsSection bootstrap={bootstrap} transaction={transaction} />
              {(transaction.split_children?.length ?? 0) > 0 ? (
                <TransactionSplitParentSection
                  splitChildren={transaction.split_children ?? []}
                  transaction={transaction}
                />
              ) : null}
              {transaction.split_parent ? (
                <TransactionSplitChildSection
                  parent={transaction.split_parent}
                  canEdit={transaction.permissions.can_edit}
                />
              ) : null}
              {transaction.permissions.can_edit ? (
                <TransactionDetailSettings
                  bootstrap={bootstrap}
                  onDeleted={close}
                  transaction={transaction}
                />
              ) : (
                <TransactionBillAllocations transaction={transaction} />
              )}
              <TransactionDetailMeta transaction={transaction} />
            </>
          )}
        </div>
      </Modal>
      <Outlet />
    </>
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
        <IconButton icon="x" label="Close" onClick={onClose} />
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
  label = "Category",
  notApplicableLabel,
  onSelect,
  placeholder = "Select a Category",
  portal = true,
  selectedCategoryId,
}: {
  bootstrap: Bootstrap;
  categories: ReferenceOption<CategoryId>[];
  disabled?: boolean;
  initialCategory?: { id: CategoryId; name: string; color: string; icon: string } | null;
  label?: string;
  notApplicableLabel?: string;
  onSelect: (categoryId: CategoryId | "") => void;
  placeholder?: string;
  portal?: boolean;
  selectedCategoryId: CategoryId | "";
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const notApplicable = notApplicableLabel !== undefined;
  const unavailable = disabled === true || notApplicable;
  const selected = notApplicable
    ? undefined
    : (categories.find((category) => category.id === selectedCategoryId) ??
      (initialCategory?.id === selectedCategoryId ? initialCategory : undefined));
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
    if (isCreating || unavailable) return false;
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
      disabled={unavailable || isCreating}
      error={createError}
      label={label}
      portal={portal}
      onQueryChange={(value) => {
        setQuery(value);
        setCreateError(undefined);
      }}
      onSelect={(value) => {
        if (unavailable) return false;
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
      selectedValues={[notApplicable ? "" : selectedCategoryId]}
      trigger={
        selected ? (
          <CategoryPill color={selected.color} icon={selected.icon} name={selected.name} />
        ) : (
          <span className="text-sm text-secondary">{notApplicableLabel ?? placeholder}</span>
        )
      }
    />
  );
}

export function MerchantSelect({
  bootstrap,
  disabled,
  initialMerchant,
  label = "Merchant",
  merchants,
  onSelect,
  placeholder = "No merchant",
  portal = true,
  selectedMerchantId,
}: {
  bootstrap: Bootstrap;
  disabled?: boolean;
  initialMerchant?: { id: MerchantId; name: string; logo_url?: string | null } | null;
  label?: string;
  merchants: ReferenceOption<MerchantId>[];
  onSelect: (merchantId: MerchantId | "") => void;
  placeholder?: string;
  portal?: boolean;
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
      label={label}
      portal={portal}
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
          <span className="text-sm text-secondary">{placeholder}</span>
        )
      }
    />
  );
}

function TransactionEditableForm({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap & Pick<SpaBootstrap, "accountDetailText">;
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
        {transaction.permissions.can_edit ? (
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
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {transaction.permissions.can_edit ? (
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
          ) : null}
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
              notApplicableLabel={
                transaction.kind === "funds_movement"
                  ? bootstrap.accountDetailText.category_not_applicable
                  : undefined
              }
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
        {transaction.permissions.can_edit ? (
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
        ) : null}
        <div className="flex justify-end pt-1">
          <SaveIndicator state={saveState} />
        </div>
      </div>
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
          {transfer.status === "confirmed" ? (
            <Link
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              params={{ transferId: transfer.id }}
              to="/transactions/transfers/$transferId"
            >
              View transfer
              <Icon name="chevron-right" size="sm" />
            </Link>
          ) : null}
          {transfer.status === "pending" && transfer.permissions.can_edit ? (
            <span className="flex gap-1.5">
              <Button
                disabled={decide.isPending}
                onClick={() => {
                  decide.mutate("confirmed");
                }}
                size="sm"
              >
                Keep match
              </Button>
              <Button
                disabled={decide.isPending}
                onClick={() => {
                  decide.mutate("rejected");
                }}
                size="sm"
                variant="secondary"
              >
                Reject
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function TransactionDetailBody({ transaction }: { transaction: SpaTransactionDetail }) {
  return (
    <Section title="Details">
      <dl className="space-y-3">
        <Field label="Account" value={transaction.account.name} />
        {!transaction.permissions.can_annotate || (transaction.parent_entry_id ?? null) !== null ? (
          <Field label="Category" value={transaction.category?.name ?? "Uncategorized"} />
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-secondary">Merchant</dt>
            <dd className="text-sm text-primary">
              {transaction.merchant ? <MerchantLinks transaction={transaction} /> : "None"}
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

type SplitChild = NonNullable<SpaTransactionDetail["split_children"]>[number];
type SplitParentSummary = NonNullable<SpaTransactionDetail["split_parent"]>;

async function unsplitTransaction(transactionId: TransactionId): Promise<void> {
  const response = await fetch(`/transactions/${transactionId}/split.json`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-CSRF-Token": readCsrfToken() },
  });
  if (!response.ok) throw new Error(`Unsplit failed with status ${response.status}`);
}

function SplitActions({
  transactionId,
  editTransactionId,
}: {
  transactionId: TransactionId;
  editTransactionId: TransactionId;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsplitting, setUnsplitting] = useState(false);

  async function confirmUnsplit() {
    setUnsplitting(true);
    setError(null);
    try {
      await unsplitTransaction(transactionId);
      await queryClient.invalidateQueries();
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not unsplit transaction");
    } finally {
      setUnsplitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 pt-2">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          params={{ transactionId: editTransactionId }}
          to="/transactions/$transactionId/split/edit"
        >
          <Icon name="pencil" size="sm" />
          Edit Split
        </Link>
        <Button
          className="text-destructive hover:underline"
          onClick={() => {
            setConfirming(true);
          }}
          size="sm"
          variant="link"
        >
          <Icon name="rotate-ccw" size="sm" />
          Unsplit
        </Button>
      </div>
      {confirming ? (
        <Modal
          ariaLabelledby="unsplit-confirm-title"
          onClose={() => {
            setConfirming(false);
          }}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <h2 className="text-lg font-medium text-primary" id="unsplit-confirm-title">
            Unsplit Transaction
          </h2>
          <p className="my-4 text-sm text-secondary">
            This will remove all split entries and restore the original transaction.
          </p>
          {error !== null ? (
            <p className="my-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => {
                setConfirming(false);
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={unsplitting}
              onClick={() => {
                void confirmUnsplit();
              }}
              variant="destructive"
            >
              Unsplit
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function TransactionSplitParentSection({
  transaction,
  splitChildren,
}: {
  transaction: SpaTransactionDetail;
  splitChildren: SplitChild[];
}) {
  return (
    <Section defaultOpen title="Split Entries">
      <p className="text-xs text-secondary">
        This transaction has been split into the following entries.
      </p>
      {splitChildren.map((child) => (
        <div
          className="flex items-center justify-between rounded-lg border border-primary p-2"
          key={child.entry_id}
        >
          <div>
            <p className="text-sm font-medium text-primary">{child.name}</p>
            <p className="flex items-center gap-1 text-xs text-secondary">
              {child.transfer_account_id ? (
                <>
                  <Icon name="arrow-left-right" size="sm" />
                  <span>
                    Transfer
                    {typeof child.category_name === "string" ? ` · ${child.category_name}` : ""}
                  </span>
                </>
              ) : (
                (child.category_name ?? "(uncategorized)")
              )}
            </p>
          </div>
          <p className="privacy-sensitive text-sm font-medium text-primary">{child.amount}</p>
        </div>
      ))}
      {transaction.permissions.can_edit ? (
        <SplitActions editTransactionId={transaction.id} transactionId={transaction.id} />
      ) : null}
    </Section>
  );
}

function TransactionSplitChildSection({
  parent,
  canEdit,
}: {
  parent: SplitParentSummary;
  canEdit: boolean;
}) {
  return (
    <Section defaultOpen title="Part of Split">
      <div className="space-y-3 rounded-lg border border-secondary p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{parent.name}</p>
            <p className="text-xs text-secondary">{formatShortDate(parent.date)}</p>
          </div>
          <p className="privacy-sensitive text-sm font-medium text-primary">{parent.amount}</p>
        </div>
      </div>
      {canEdit ? (
        <SplitActions
          editTransactionId={parent.transaction_id}
          transactionId={parent.transaction_id}
        />
      ) : null}
    </Section>
  );
}
function MerchantLinks({ transaction }: { transaction: SpaTransactionDetail }) {
  const merchant = transaction.merchant;
  if (!merchant) return null;

  // Uncategorized transactions omit :action_value so the rule form opens with
  // "Set transaction category" and an empty category for the user to pick.
  const ruleSearch: Record<string, string> = {
    resource_type: "transaction",
    merchant_id: merchant.id,
    action_type: "set_transaction_category",
  };
  if (transaction.category?.id !== undefined) ruleSearch.action_value = transaction.category.id;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link
        className="font-medium text-link hover:underline"
        search={{ merchants: [merchant.name], page: 1 }}
        to="/transactions"
      >
        {merchant.name}
      </Link>
      {transaction.permissions.can_annotate ? (
        <>
          <Link
            className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary hover:underline"
            params={{ merchantId: merchant.id }}
            search={{ return_to: currentReturnTo() }}
            to="/family_merchants/$merchantId/edit"
          >
            <Icon name="pencil" size="sm" />
            Edit merchant
          </Link>
          <Link
            className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary hover:underline"
            search={{ ...ruleSearch, return_to: currentReturnTo() }}
            to="/rules/new"
          >
            <Icon name="plus" size="sm" />
            {transaction.category?.name !== undefined
              ? `Always categorize as ${transaction.category.name}`
              : "Always categorize"}
          </Link>
        </>
      ) : null}
    </span>
  );
}
function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TransactionAttachmentsSection({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  void deletingId;
  const attachments = transaction.attachments ?? [];
  function refreshDetail() {
    void queryClient.invalidateQueries({
      queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
    });
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) form.append("attachments[]", file, file.name);
      const response = await fetch(
        `${bootstrap.apiPaths.transactions}/${transaction.id}/attachments`,
        {
          body: form,
          credentials: "same-origin",
          headers: { Accept: "application/json", "X-CSRF-Token": readCsrfToken() },
          method: "POST",
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        let message = `Upload failed with status ${response.status}`;
        if (typeof payload === "object" && payload !== null && "message" in payload) {
          const raw: unknown = payload.message;
          if (typeof raw === "string") message = raw;
        }
        throw new Error(message);
      }
      refreshDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload files");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(
        `${bootstrap.apiPaths.transactions}/${transaction.id}/attachments/${id}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json", "X-CSRF-Token": readCsrfToken() },
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error(`Delete failed with status ${response.status}`);
      refreshDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete file");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Section title="Attachments">
      {transaction.permissions.can_annotate ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-secondary bg-container px-4 py-8 text-center transition-colors hover:bg-container-inset-hover">
          <Icon className="text-secondary" name="plus" />
          <span className="text-sm font-medium text-primary">Browse to add files</span>
          <span className="text-xs text-secondary">
            {attachments.length} of 10 used · up to 10 MB each
          </span>
          <input
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            disabled={uploading}
            multiple
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}
      {uploading ? <p className="text-xs text-secondary">Uploading…</p> : null}
      {error !== null ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {attachments.length === 0 ? (
        <p className="text-sm text-secondary">No attachments</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Files ({attachments.length})</p>
          {attachments.map((attachment) => (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border border-primary bg-container p-3"
              key={attachment.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon
                  className="shrink-0 text-secondary"
                  name={attachment.content_type.startsWith("image/") ? "image" : "file-text"}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary">{attachment.filename}</p>
                  <p className="text-xs text-secondary">
                    {formatAttachmentSize(attachment.byte_size)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  aria-label={`View ${attachment.filename}`}
                  className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
                  href={`${bootstrap.apiPaths.transactions}/${transaction.id}/attachments/${attachment.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon name="eye" size="sm" />
                </a>
                <a
                  aria-label={`Download ${attachment.filename}`}
                  className="rounded-lg p-2 text-secondary hover:bg-container-inset-hover hover:text-primary"
                  href={`${bootstrap.apiPaths.transactions}/${transaction.id}/attachments/${attachment.id}?disposition=attachment`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon name="download" size="sm" />
                </a>
                {transaction.permissions.can_edit ? (
                  <IconButton
                    icon="trash-2"
                    label={`Delete ${attachment.filename}`}
                    onClick={() => {
                      void removeAttachment(attachment.id);
                    }}
                    size="sm"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
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

function TransactionDuplicateAlert({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicate = transaction.potential_duplicate ?? null;

  if (duplicate === null) return null;

  async function resolve(action: "merge" | "dismiss") {
    setBusy(true);
    setError(null);
    try {
      if (action === "merge") await mergeDuplicate(bootstrap.apiPaths.transactions, transaction.id);
      else await dismissDuplicate(bootstrap.apiPaths.transactions, transaction.id);
      await queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resolve duplicate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-warning bg-container p-4" role="alert">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0 text-warning" name="circle-alert" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-primary">Possible duplicate detected</p>
          <p className="text-sm text-secondary">
            This pending transaction may be the same as the posted transaction below. If so, merge
            them to avoid double-counting.
          </p>
          <div className="rounded-lg border border-primary bg-container p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-primary">{duplicate.name}</p>
                <p className="text-xs text-secondary">
                  {formatShortDate(duplicate.date)} · {duplicate.account_name}
                </p>
              </div>
              <p className="privacy-sensitive shrink-0 text-sm font-medium text-primary">
                {duplicate.amount}
              </p>
            </div>
          </div>
          {error !== null ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                void resolve("merge");
              }}
            >
              Yes, merge them
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void resolve("dismiss");
              }}
              variant="secondary"
            >
              No, keep both
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionProtectionBanner({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (transaction.protected_from_sync !== true) return null;

  async function unlock() {
    setUnlocking(true);
    setError(null);
    try {
      await unlockEntry(bootstrap.apiPaths.transactions, transaction.id);
      await queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not unlock entry");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="rounded-xl bg-container p-3 text-xs text-secondary shadow-border-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 font-medium uppercase">
          <Icon name="lock" size="sm" />
          Protected from sync
        </p>
        {transaction.permissions.can_edit ? (
          <Button
            className="text-xs font-medium"
            disabled={unlocking}
            onClick={() => void unlock()}
            size="sm"
            variant="link"
          >
            Unlock
          </Button>
        ) : null}
      </div>
      <p className="mt-1">Manual changes are preserved when the provider syncs.</p>
      {error !== null ? (
        <p className="mt-1 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const ACTIVITY_LABELS = [
  "Buy",
  "Sell",
  "Sweep In",
  "Sweep Out",
  "Dividend",
  "Reinvestment",
  "Interest",
  "Fee",
  "Transfer",
  "Contribution",
  "Withdrawal",
  "Exchange",
  "Other",
] as const;

function TransactionActivityLabelRow({
  bootstrap,
  transaction,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  // Investment/crypto accounts expose the accountable type; only those get
  // the activity label (mirrors the legacy settings gate).
  const accountType = transaction.account.account_type ?? "";
  if (accountType !== "investment" && accountType !== "crypto") return null;

  async function changeLabel(value: string) {
    setSaving(true);
    try {
      await updateTransaction(bootstrap.apiPaths.transactions, transaction.id, {
        investment_activity_label: value === "" ? null : value,
      });
      await queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-primary">Activity type</p>
        <p className="text-xs text-secondary">How this investment activity is classified.</p>
      </div>
      <select
        aria-label="Activity type"
        className="form-field__input max-w-40 border border-secondary px-3 py-1.5 text-sm"
        disabled={saving}
        onChange={(event) => {
          void changeLabel(event.target.value);
        }}
        value={transaction.investment_activity_label ?? ""}
      >
        <option value="">—</option>
        {ACTIVITY_LABELS.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TransactionBillAllocations({ transaction }: { transaction: SpaTransactionDetail }) {
  const allocations = transaction.bill_allocations ?? [];
  if (allocations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-primary">Applied to bills</p>
      {allocations.map((allocation) => (
        <div
          className="flex items-center justify-between gap-2 text-sm"
          key={allocation.allocation_id}
        >
          <div>
            <p className="font-medium text-primary">{allocation.bill_name}</p>
            <p className="privacy-sensitive text-xs text-secondary">
              {allocation.amount} · {formatShortDate(allocation.due_on)}
            </p>
          </div>
          {allocation.unreviewed ? <span className="text-xs text-warning">Unreviewed</span> : null}
        </div>
      ))}
    </div>
  );
}

function TransactionDetailSettings({
  bootstrap,
  transaction,
  onDeleted,
}: {
  bootstrap: Bootstrap;
  transaction: SpaTransactionDetail;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const isSplitChild = (transaction.parent_entry_id ?? null) !== null;
  const isIncome = transaction.signed_amount_cents > 0;
  const [recurringDone, setRecurringDone] = useState(transaction.recurring_exists ?? false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggleOneTime(next: boolean) {
    await updateTransaction(bootstrap.apiPaths.transactions, transaction.id, {
      kind: next ? "one_time" : "standard",
    });
    await queryClient.invalidateQueries({
      queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
  }

  async function markRecurring() {
    setRecurringBusy(true);
    setRecurringError(null);
    try {
      await markTransactionRecurring(bootstrap.apiPaths.transactions, transaction.id);
      setRecurringDone(true);
    } catch (caught) {
      setRecurringError(caught instanceof Error ? caught.message : "Could not mark as recurring");
    } finally {
      setRecurringBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransaction(bootstrap.apiPaths.transactions, transaction.id);
      await queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
      onDeleted();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Could not delete transaction");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Section title="Settings">
      {!isSplitChild ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">
              {isIncome ? "One-time Income" : "One-time Expense"}
            </p>
            <p className="text-xs text-secondary">
              One-time transactions will be excluded from certain budgeting calculations and reports
              to help you see what&apos;s really important.
            </p>
          </div>
          <Toggle
            checked={transaction.kind === "one_time"}
            id="txn-one-time"
            label={isIncome ? "One-time Income" : "One-time Expense"}
            onChange={(next) => {
              void toggleOneTime(next);
            }}
          />
        </div>
      ) : null}
      {!isSplitChild ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Recurring Transaction</p>
            <p className="text-xs text-secondary">
              {recurringDone
                ? "A recurring transaction already exists for this pattern."
                : "Track this as a recurring transaction. Amount variance is automatically calculated from past 6 months of similar transactions."}
            </p>
            {recurringError !== null ? (
              <p className="text-xs text-destructive" role="alert">
                {recurringError}
              </p>
            ) : null}
          </div>
          <Button
            className="shrink-0"
            disabled={recurringBusy || recurringDone}
            iconProps={{ name: "refresh-ccw", size: "sm" }}
            onClick={() => void markRecurring()}
            variant="outline"
          >
            Mark as Recurring
          </Button>
        </div>
      ) : null}
      <TransactionActivityLabelRow bootstrap={bootstrap} transaction={transaction} />
      <TransactionBillAllocations transaction={transaction} />
      {!isSplitChild && transaction.pending ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Duplicate of Posted Transaction?</p>
            <p className="text-xs text-secondary">
              Manually merge this pending transaction with its posted version.
            </p>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            href={`/transactions/${transaction.id}/pending_duplicate_merges/new`}
          >
            <Icon name="git-branch" size="sm" />
            Open merger
          </a>
        </div>
      ) : null}
      {!isSplitChild && (transaction.split_children?.length ?? 0) === 0 && !transaction.transfer ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Split Transaction</p>
            <p className="text-xs text-secondary">
              Split this transaction into multiple entries with different categories and amounts.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            params={{ transactionId: transaction.id }}
            to="/transactions/$transactionId/split/new"
          >
            <Icon name="split" size="sm" />
            Split
          </Link>
        </div>
      ) : null}
      {!isSplitChild ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Transfer or Debt Payment?</p>
            <p className="text-xs text-secondary">
              Connect this transaction to its counterpart in another account.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            params={{ transactionId: transaction.id }}
            to="/transactions/$transactionId/transfer_match/new"
          >
            <Icon name="arrow-left-right" size="sm" />
            Open matcher
          </Link>
        </div>
      ) : null}
      {!isSplitChild &&
      !transaction.excluded &&
      transaction.account.account_type === "investment" ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Convert to trade</p>
            <p className="text-xs text-secondary">
              Record this as a buy or sell of a security instead of a cash transaction.
            </p>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover"
            href={`/transactions/${transaction.id}/convert_to_trade`}
          >
            <Icon name="arrow-left-right" size="sm" />
            Convert
          </a>
        </div>
      ) : null}
      {!isSplitChild ? (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-primary">Delete transaction</p>
            <p className="text-xs text-secondary">
              This permanently deletes the transaction, affects your historical balances, and cannot
              be undone.
            </p>
            {deleteError !== null ? (
              <p className="text-xs text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
          </div>
          <Button
            className="shrink-0"
            onClick={() => {
              setConfirmingDelete(true);
            }}
            variant="outline_destructive"
          >
            Delete
          </Button>
        </div>
      ) : null}
      {confirmingDelete ? (
        <Modal
          ariaLabelledby="delete-transaction-title"
          onClose={() => {
            setConfirmingDelete(false);
          }}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <h2 className="text-lg font-medium text-primary" id="delete-transaction-title">
            Delete transaction
          </h2>
          <p className="my-4 text-sm text-secondary">
            This permanently deletes {transaction.name}, affects your historical balances, and
            cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => {
                setConfirmingDelete(false);
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={() => {
                void confirmDelete();
              }}
              variant="destructive"
            >
              Delete
            </Button>
          </div>
        </Modal>
      ) : null}
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
