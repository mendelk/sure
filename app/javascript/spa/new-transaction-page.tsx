import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { useDismiss } from "./use-dismiss";
import {
  TransactionApiError,
  createTransaction,
  referenceDataQueryOptions,
  type ReferenceOption,
  type TransactionCreateInput,
} from "./api/transactions";
import {
  CategorySelect,
  MerchantSelect,
  TagSelect,
  type Bootstrap,
} from "./transaction-detail-page";

export type NewTransactionSearch = {
  account_id?: string;
  nature?: "inflow" | "outflow";
};

export function validateNewTransactionSearch(input: Record<string, unknown>): NewTransactionSearch {
  const result: NewTransactionSearch = {};
  const accountId = input.account_id;
  if (typeof accountId === "string" && accountId.trim().length > 0) result.account_id = accountId;
  const nature = input.nature;
  if (nature === "inflow" || nature === "outflow") result.nature = nature;
  return result;
}

export type NewTransactionFormValues = {
  account_id: string;
  amount: string;
  category_id: string;
  date: string;
  merchant_id: string;
  name: string;
  nature: "inflow" | "outflow";
  notes: string;
  tag_ids: string[];
};

const inputClasses = "form-field__input w-full";
const labelClasses = "form-field__label";

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function NewTransactionPage() {
  const { bootstrap }: { bootstrap: Bootstrap } = useRouteContext({ from: "__root__" });
  const search: NewTransactionSearch = useSearch({ from: "/transactions/new" });
  const navigate = useNavigate({ from: "/transactions/new" });
  const queryClient = useQueryClient();

  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  );
  const accounts = referenceQuery.data?.accounts ?? [];
  const categories = referenceQuery.data?.categories ?? [];
  const merchants = referenceQuery.data?.merchants ?? [];
  const tags = referenceQuery.data?.tags ?? [];

  const create = useMutation({
    mutationFn: (input: NonNullable<TransactionCreateInput>) =>
      createTransaction(bootstrap.apiPaths.transactions, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void navigate({ to: "/transactions" });
    },
  });
  const serverErrors = create.error instanceof TransactionApiError ? create.error.errors : [];

  const form = useForm({
    defaultValues: {
      account_id: search.account_id ?? "",
      amount: "",
      category_id: "",
      date: todayIso(),
      merchant_id: "",
      name: "",
      nature: search.nature ?? "outflow",
      notes: "",
      tag_ids: [] as string[],
    },
    onSubmit: ({ value }) => {
      const amount = Number(value.amount);
      const input: NonNullable<TransactionCreateInput> = {
        account_id: value.account_id,
        amount: Number.isFinite(amount) ? amount : 0,
        category_id: value.category_id.length > 0 ? value.category_id : undefined,
        date: value.date,
        merchant_id: value.merchant_id.length > 0 ? value.merchant_id : undefined,
        name: value.name.trim(),
        nature: value.nature === "inflow" ? "inflow" : "expense",
        notes: value.notes.trim().length > 0 ? value.notes.trim() : undefined,
        tag_ids: value.tag_ids,
      };
      create.mutate(input);
    },
  });

  function close() {
    void navigate({ to: "/transactions" });
  }

  return (
    <Dialog className="relative z-40" onClose={close} open>
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-overlay pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      />
      <div className="fixed inset-0 flex items-end justify-end overflow-y-auto lg:p-3">
        <DialogPanel className="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]">
          <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
            <NewTransactionHeader onClose={close} />
            {serverErrors.length > 0 ? (
              <div className="rounded-xl border border-destructive bg-container p-4" role="alert">
                <p className="font-medium text-primary">Could not save this transaction</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-secondary">
                  {serverErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <form
              className="flex grow flex-col gap-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit();
              }}
            >
              <form.Field name="nature">
                {(natureField) => (
                  <div
                    className="grid grid-cols-2 gap-1 rounded-xl bg-container-inset p-1"
                    role="tablist"
                    aria-label="Transaction type"
                  >
                    {(
                      [
                        ["outflow", "Expense"],
                        ["inflow", "Income"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        aria-selected={natureField.state.value === value}
                        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          natureField.state.value === value
                            ? "bg-container text-primary shadow-border-xs"
                            : "text-secondary hover:text-primary"
                        }`}
                        key={value}
                        onClick={() => {
                          natureField.handleChange(value);
                        }}
                        role="tab"
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </form.Field>
              <div className="space-y-2">
                <form.Field
                  name="name"
                  validators={{
                    onSubmit: ({ value }) =>
                      value.trim().length === 0 ? "Enter a description" : undefined,
                  }}
                >
                  {(field) => (
                    <div className="form-field">
                      <div className="form-field__body">
                        <label className={labelClasses} htmlFor="new-txn-name">
                          Description
                        </label>
                        <input
                          autoComplete="off"
                          className={inputClasses}
                          id="new-txn-name"
                          onChange={(event) => {
                            field.handleChange(event.currentTarget.value);
                          }}
                          placeholder="Describe transaction"
                          required
                          type="text"
                          value={field.state.value}
                        />
                        <FieldError message={field.state.meta.errors.join(" ")} />
                      </div>
                    </div>
                  )}
                </form.Field>
                <form.Field
                  name="account_id"
                  validators={{
                    onSubmit: ({ value }) => (value.length === 0 ? "Select an account" : undefined),
                  }}
                >
                  {(field) => (
                    <AccountSelect
                      accounts={accounts}
                      loading={referenceQuery.isPending}
                      onSelect={(id) => {
                        field.handleChange(id);
                      }}
                      selectedAccountId={field.state.value}
                      error={field.state.meta.errors.join(" ")}
                    />
                  )}
                </form.Field>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <form.Field
                    name="amount"
                    validators={{
                      onSubmit: ({ value }): string | undefined => {
                        const parsed = Number(value);
                        if (value.trim().length === 0) return "Enter an amount";
                        if (!Number.isFinite(parsed) || parsed <= 0)
                          return "Enter an amount greater than zero";
                        return undefined;
                      },
                    }}
                  >
                    {(field) => (
                      <div className="form-field">
                        <div className="form-field__body">
                          <label className={labelClasses} htmlFor="new-txn-amount">
                            Amount
                          </label>
                          <input
                            className={inputClasses}
                            id="new-txn-amount"
                            inputMode="decimal"
                            min={0}
                            onChange={(event) => {
                              field.handleChange(event.currentTarget.value);
                            }}
                            placeholder="0.00"
                            required
                            step="0.01"
                            type="number"
                            value={field.state.value}
                          />
                          <FieldError message={field.state.meta.errors.join(" ")} />
                        </div>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="date">
                    {(field) => (
                      <div className="form-field">
                        <div className="form-field__body">
                          <label className={labelClasses} htmlFor="new-txn-date">
                            Date
                          </label>
                          <input
                            className={inputClasses}
                            id="new-txn-date"
                            max={todayIso()}
                            min="1996-01-01"
                            onChange={(event) => {
                              field.handleChange(event.currentTarget.value);
                            }}
                            required
                            type="date"
                            value={field.state.value}
                          />
                        </div>
                      </div>
                    )}
                  </form.Field>
                </div>
                <form.Field name="category_id">
                  {(field) => (
                    <CategorySelect
                      bootstrap={bootstrap}
                      categories={categories}
                      onSelect={(id) => {
                        field.handleChange(id);
                      }}
                      selectedCategoryId={field.state.value}
                    />
                  )}
                </form.Field>
              </div>
              <details className="group" open={false}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-medium uppercase text-secondary">Details</span>
                  <Icon
                    className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
                    name="chevron-down"
                  />
                </summary>
                <div className="mt-2 space-y-2">
                  <form.Field name="merchant_id">
                    {(field) => (
                      <MerchantSelect
                        bootstrap={bootstrap}
                        merchants={merchants}
                        onSelect={(id) => {
                          field.handleChange(id);
                        }}
                        selectedMerchantId={field.state.value}
                      />
                    )}
                  </form.Field>
                  <form.Field name="tag_ids" mode="array">
                    {(field) => (
                      <TagSelect
                        bootstrap={bootstrap}
                        onSelect={(ids) => {
                          field.handleChange(ids);
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
                          <label className={labelClasses} htmlFor="new-txn-notes">
                            Notes
                          </label>
                          <textarea
                            className={inputClasses}
                            id="new-txn-notes"
                            onChange={(event) => {
                              field.handleChange(event.currentTarget.value);
                            }}
                            placeholder="Enter a note"
                            rows={5}
                            value={field.state.value}
                          />
                        </div>
                      </div>
                    )}
                  </form.Field>
                </div>
              </details>
              <div className="mt-auto flex items-center justify-end gap-2 pt-2">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-secondary bg-container px-4 text-sm font-medium text-primary transition-colors hover:bg-container-hover"
                  to="/transactions"
                >
                  Cancel
                </Link>
                <form.Subscribe selector={(state) => state.canSubmit}>
                  {(canSubmit) => (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg button-bg-primary px-4 text-sm font-medium text-inverse transition-opacity disabled:opacity-50"
                      disabled={!canSubmit || create.isPending}
                      type="submit"
                    >
                      {create.isPending ? "Saving…" : "Create transaction"}
                    </button>
                  )}
                </form.Subscribe>
              </div>
            </form>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function NewTransactionHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <DialogTitle className="text-lg font-medium text-primary">New transaction</DialogTitle>
        <p className="mt-0.5 text-sm text-secondary">
          Record income or an expense on a manual account.
        </p>
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
  );
}

function FieldError({ message }: { message: string }) {
  if (message.trim().length === 0) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

type AccountSelectProps = {
  accounts: ReferenceOption[];
  error?: string;
  loading: boolean;
  onSelect: (accountId: string) => void;
  selectedAccountId: string;
};

function AccountSelect({
  accounts,
  error,
  loading,
  onSelect,
  selectedAccountId,
}: AccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  const selected = accounts.find((account) => account.id === selectedAccountId);
  const filtered = accounts.filter((account) =>
    account.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="form-field">
      <div className="form-field__body">
        <span className={labelClasses} id="new-txn-account-label">
          Account
        </span>
        <div className="relative" ref={containerRef}>
          <button
            aria-labelledby="new-txn-account-label"
            aria-expanded={isOpen}
            className="form-field__input flex min-h-7 cursor-pointer items-center gap-2 pr-8 text-left"
            onClick={() => {
              setIsOpen((value) => !value);
              setQuery("");
            }}
            type="button"
          >
            {selected ? (
              <span className="truncate text-sm text-primary">{selected.name}</span>
            ) : (
              <span className="text-sm text-secondary">
                {loading ? "Loading accounts…" : "Select an Account"}
              </span>
            )}
          </button>
          {isOpen ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-48 rounded-lg bg-container p-1.5 shadow-lg shadow-border-xs">
              <div className="relative mb-1">
                <input
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                  }}
                  placeholder="Search accounts"
                  ref={searchInputRef}
                  type="search"
                  value={query}
                />
                <Icon
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary"
                  name="search"
                />
              </div>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {filtered.map((account) => (
                  <button
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                      account.id === selectedAccountId ? "bg-container-inset" : ""
                    }`}
                    key={account.id}
                    onClick={() => {
                      onSelect(account.id);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    <span className="truncate text-sm text-primary">{account.name}</span>
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-secondary">No matching accounts.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <FieldError message={error ?? ""} />
      </div>
    </div>
  );
}
