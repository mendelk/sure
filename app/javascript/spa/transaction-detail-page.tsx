import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CategoryIcon, Icon } from "./icon";
import { Modal } from "./modal";
import {
  TransactionApiError,
  createCategory,
  createMerchant,
  createTag,
  createTransferMatch,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  transferMatchCandidatesQueryOptions,
  updateTransaction,
  updateTransferStatus,
  type ReferenceOption,
  type SpaTransactionDetail,
} from "./api/transactions";
import type { SpaBootstrap } from "./bootstrap";
import { useDismiss } from "./use-dismiss";

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
  const { transactionId } = useParams({ from: "/transactions/$transactionId" });
  const navigate = useNavigate({ from: "/transactions/$transactionId" });
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
    void navigate({ to: "/transactions", resetScroll: false });
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
              <Link className="text-sm font-medium text-link hover:underline" to="/transactions">
                Back to transactions
              </Link>
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

function TagPill({ name, color }: { name: string; color?: string }) {
  const customColor = typeof color === "string" && color.startsWith("#") ? color : "#737373";
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium leading-none align-middle"
      style={{
        backgroundColor: `color-mix(in oklab, ${customColor} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${customColor} 20%, transparent)`,
        color: customColor,
      }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: customColor }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

function Toggle({
  checked,
  disabled,
  id,
  label = "Toggle",
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  id?: string;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-300 focus-ring disabled:cursor-not-allowed disabled:opacity-70 ${
        checked ? "bg-success" : "bg-toggle-track"
      }`}
      disabled={disabled}
      id={id}
      onClick={() => {
        onChange(!checked);
      }}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-xs transition duration-300 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0.5"
        } mt-0.5`}
      />
    </button>
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
  if (typeof logoUrl === "string" && logoUrl.length > 0) {
    return (
      <img
        alt=""
        className="size-5 shrink-0 rounded-full border border-secondary object-contain"
        loading="lazy"
        src={logoUrl}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium uppercase"
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-gray-500) 10%, transparent)",
        borderColor: "color-mix(in oklab, var(--color-gray-500) 20%, transparent)",
        color: "var(--color-gray-500)",
      }}
    >
      {name.charAt(0)}
    </span>
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
  categories: ReferenceOption[];
  disabled?: boolean;
  initialCategory?: { id: string; name: string; color: string; icon: string } | null;
  onSelect: (categoryId: string) => void;
  selectedCategoryId: string;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setQuery("");
        setCreateError(null);
      }
      return next;
    });
  }

  const selected =
    categories.find((c) => c.id === selectedCategoryId) ??
    (initialCategory !== undefined &&
    initialCategory !== null &&
    initialCategory.id === selectedCategoryId
      ? initialCategory
      : undefined);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(lowerQuery));
  const exactMatch = categories.some((c) => c.name.toLowerCase() === lowerQuery);
  const canCreate = trimmedQuery.length > 0 && !exactMatch;

  async function handleCreate() {
    if (isCreating || trimmedQuery.length === 0) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const newCat = await createCategory(bootstrap.apiPaths.categories, trimmedQuery);
      queryClient.setQueryData(
        [
          "spa",
          "reference",
          bootstrap.apiPaths.categories,
          bootstrap.apiPaths.merchants,
          bootstrap.apiPaths.tags,
        ],
        (
          old:
            | {
                categories: ReferenceOption[];
                merchants: ReferenceOption[];
                tags: ReferenceOption[];
              }
            | undefined,
        ) => {
          if (!old) return old;
          return {
            ...old,
            categories: [...old.categories, newCat].toSorted((a, b) =>
              a.name.localeCompare(b.name),
            ),
          };
        },
      );
      onSelect(newCat.id);
      setIsOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create category");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="form-field">
        <div className="form-field__body">
          <label className="form-field__label" htmlFor="txn-category-trigger">
            Category
          </label>
          <button
            aria-expanded={isOpen}
            className="form-field__input min-h-7 flex cursor-pointer items-center gap-2 pr-8 text-left"
            disabled={disabled}
            id="txn-category-trigger"
            onClick={toggle}
            ref={triggerRef}
            type="button"
          >
            {selected ? (
              <CategoryPill color={selected.color} icon={selected.icon} name={selected.name} />
            ) : (
              <span className="text-sm text-secondary">Select a Category</span>
            )}
          </button>
        </div>
      </div>

      {isOpen && disabled !== true ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-48 rounded-lg bg-container p-1.5 shadow-lg shadow-border-xs">
          <div className="relative mb-1">
            <input
              autoComplete="off"
              className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Search categories"
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
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                selectedCategoryId.length === 0 ? "bg-container-inset" : ""
              }`}
              data-selected={selectedCategoryId.length === 0}
              onClick={() => {
                onSelect("");
                setIsOpen(false);
              }}
              type="button"
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center ${
                  selectedCategoryId.length === 0 ? "" : "invisible"
                }`}
              >
                <Icon className="size-4 text-primary" name="check" />
              </span>
              <span className="text-secondary">(uncategorized)</span>
            </button>

            {filteredCategories.map((cat) => {
              const isSelected = cat.id === selectedCategoryId;
              return (
                <button
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                    isSelected ? "bg-container-inset" : ""
                  }`}
                  data-selected={isSelected}
                  key={cat.id}
                  onClick={() => {
                    onSelect(cat.id);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center ${
                      isSelected ? "" : "invisible"
                    }`}
                  >
                    <Icon className="size-4 text-primary" name="check" />
                  </span>
                  <CategoryPill color={cat.color} icon={cat.icon} name={cat.name} />
                </button>
              );
            })}

            {canCreate ? (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-primary transition-colors hover:bg-container-inset-hover disabled:opacity-50"
                disabled={isCreating}
                onClick={() => {
                  void handleCreate();
                }}
                type="button"
              >
                <Icon className="size-4 text-primary" name="plus" />
                <span>{`Create "${trimmedQuery}"`}</span>
              </button>
            ) : null}

            {createError !== null ? (
              <p className="px-3 py-1 text-xs text-destructive">{createError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
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
  initialMerchant?: { id: string; name: string; logo_url?: string | null } | null;
  merchants: ReferenceOption[];
  onSelect: (merchantId: string) => void;
  selectedMerchantId: string;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setQuery("");
        setCreateError(null);
      }
      return next;
    });
  }

  const selected =
    merchants.find((m) => m.id === selectedMerchantId) ??
    (initialMerchant !== undefined &&
    initialMerchant !== null &&
    initialMerchant.id === selectedMerchantId
      ? {
          id: initialMerchant.id,
          name: initialMerchant.name,
          logoUrl: initialMerchant.logo_url ?? undefined,
        }
      : undefined);

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const filteredMerchants = merchants.filter((m) => m.name.toLowerCase().includes(lowerQuery));
  const exactMatch = merchants.some((c) => c.name.toLowerCase() === lowerQuery);
  const canCreate = trimmedQuery.length > 0 && !exactMatch;

  async function handleCreate() {
    if (isCreating || trimmedQuery.length === 0) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const newMerchant = await createMerchant(bootstrap.apiPaths.merchants, trimmedQuery);
      queryClient.setQueryData(
        [
          "spa",
          "reference",
          bootstrap.apiPaths.categories,
          bootstrap.apiPaths.merchants,
          bootstrap.apiPaths.tags,
        ],
        (
          old:
            | {
                categories: ReferenceOption[];
                merchants: ReferenceOption[];
                tags: ReferenceOption[];
              }
            | undefined,
        ) => {
          if (!old) return old;
          return {
            ...old,
            merchants: [...old.merchants, newMerchant].toSorted((a, b) =>
              a.name.localeCompare(b.name),
            ),
          };
        },
      );
      onSelect(newMerchant.id);
      setIsOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create merchant");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="form-field">
        <div className="form-field__body">
          <label className="form-field__label" htmlFor="txn-merchant-trigger">
            Merchant
          </label>
          <button
            aria-expanded={isOpen}
            className="form-field__input min-h-7 flex cursor-pointer items-center gap-2 pr-8 text-left"
            disabled={disabled}
            id="txn-merchant-trigger"
            onClick={toggle}
            ref={triggerRef}
            type="button"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <MerchantAvatar logoUrl={selected.logoUrl} name={selected.name} />
                <span className="truncate text-sm text-primary">{selected.name}</span>
              </span>
            ) : (
              <span className="text-sm text-secondary">No merchant</span>
            )}
          </button>
        </div>
      </div>

      {isOpen && disabled !== true ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-48 rounded-lg bg-container p-1.5 shadow-lg shadow-border-xs">
          <div className="focus-ring-within mb-1 flex items-center rounded-lg border border-secondary bg-container transition-shadow">
            <div className="relative w-full">
              <input
                autoComplete="off"
                className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
                placeholder="Search merchants"
                ref={searchInputRef}
                type="search"
                value={query}
              />
              <Icon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary"
                name="search"
              />
            </div>
          </div>

          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                selectedMerchantId.length === 0 ? "bg-container-inset" : ""
              }`}
              data-selected={selectedMerchantId.length === 0}
              onClick={() => {
                onSelect("");
                setIsOpen(false);
              }}
              type="button"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center ${
                  selectedMerchantId.length === 0 ? "" : "invisible"
                }`}
              >
                <Icon className="size-4 text-primary" name="check" />
              </span>
              <span className="text-secondary">No merchant</span>
            </button>

            {filteredMerchants.map((merchant) => {
              const isSelected = merchant.id === selectedMerchantId;
              return (
                <button
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                    isSelected ? "bg-container-inset" : ""
                  }`}
                  data-selected={isSelected}
                  key={merchant.id}
                  onClick={() => {
                    onSelect(merchant.id);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center ${
                      isSelected ? "" : "invisible"
                    }`}
                  >
                    <Icon className="size-4 text-primary" name="check" />
                  </span>
                  <MerchantAvatar logoUrl={merchant.logoUrl} name={merchant.name} />
                  <span className="truncate text-sm text-primary">{merchant.name}</span>
                </button>
              );
            })}

            {canCreate ? (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-primary transition-colors hover:bg-container-inset-hover disabled:opacity-50"
                disabled={isCreating}
                onClick={() => {
                  void handleCreate();
                }}
                type="button"
              >
                <Icon className="size-4 text-primary" name="plus" />
                <span>{`Create "${trimmedQuery}"`}</span>
              </button>
            ) : null}

            {createError !== null ? (
              <p className="px-3 py-1 text-xs text-destructive">{createError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TagSelect({
  bootstrap,
  disabled,
  initialTags,
  onSelect,
  selectedTagIds,
  tags,
}: {
  bootstrap: Bootstrap;
  disabled?: boolean;
  initialTags?: Array<{ id: string; name: string; color?: string }>;
  onSelect: (tagIds: string[]) => void;
  selectedTagIds: string[];
  tags: ReferenceOption[];
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setQuery("");
        setCreateError(null);
      }
      return next;
    });
  }

  const selectedTags = selectedTagIds.map((id) => {
    const found = tags.find((t) => t.id === id);
    if (found !== undefined) return found;
    const initial = initialTags?.find((t) => t.id === id);
    if (initial !== undefined) return { id: initial.id, name: initial.name, color: initial.color };
    return { id, name: id };
  });

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  const exactMatch = tags.some((t) => t.name.toLowerCase() === lowerQuery);
  const canCreate = trimmedQuery.length > 0 && !exactMatch;

  async function handleCreate() {
    if (isCreating || trimmedQuery.length === 0) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const newTag = await createTag(bootstrap.apiPaths.tags, trimmedQuery);
      queryClient.setQueryData(
        [
          "spa",
          "reference",
          bootstrap.apiPaths.categories,
          bootstrap.apiPaths.merchants,
          bootstrap.apiPaths.tags,
        ],
        (
          old:
            | {
                categories: ReferenceOption[];
                merchants: ReferenceOption[];
                tags: ReferenceOption[];
              }
            | undefined,
        ) => {
          if (!old) return old;
          return {
            ...old,
            tags: [...old.tags, newTag].toSorted((a, b) => a.name.localeCompare(b.name)),
          };
        },
      );
      onSelect([...selectedTagIds, newTag.id]);
      setQuery("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create tag");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="form-field">
        <div className="form-field__body">
          <label className="form-field__label" htmlFor="txn-tags-trigger">
            Tags
          </label>
          <button
            aria-expanded={isOpen}
            className="form-field__input form-field__input--multiselect-trigger min-h-7 flex cursor-pointer items-center gap-2 pr-8 text-left"
            disabled={disabled}
            id="txn-tags-trigger"
            onClick={toggle}
            ref={triggerRef}
            type="button"
          >
            {selectedTags.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <TagPill color={tag.color} key={tag.id} name={tag.name} />
                ))}
              </span>
            ) : (
              <span className="text-sm text-secondary">None</span>
            )}
          </button>
        </div>
      </div>

      {isOpen && disabled !== true ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 min-w-48 rounded-lg bg-container p-1.5 shadow-lg shadow-border-xs">
          <div className="relative mb-1">
            <input
              autoComplete="off"
              className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Search tags"
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
            {filteredTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                    isSelected ? "bg-container-inset" : ""
                  }`}
                  data-selected={isSelected}
                  key={tag.id}
                  onClick={() => {
                    const next = isSelected
                      ? selectedTagIds.filter((id) => id !== tag.id)
                      : [...selectedTagIds, tag.id];
                    onSelect(next);
                  }}
                  type="button"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center ${
                      isSelected ? "" : "invisible"
                    }`}
                  >
                    <Icon className="size-4 text-primary" name="check" />
                  </span>
                  <TagPill color={tag.color} name={tag.name} />
                </button>
              );
            })}

            {canCreate ? (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-primary transition-colors hover:bg-container-inset-hover disabled:opacity-50"
                disabled={isCreating}
                onClick={() => {
                  void handleCreate();
                }}
                type="button"
              >
                <Icon className="size-4 text-primary" name="plus" />
                <span>{`Create "${trimmedQuery}"`}</span>
              </button>
            ) : null}

            {createError !== null ? (
              <p className="px-3 py-1 text-xs text-destructive">{createError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
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
    mutationFn: (input: Record<string, unknown>) =>
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
      setSaveState("idle");
    },
  });

  const form = useForm({
    defaultValues: {
      category_id: transaction.category?.id ?? "",
      date: transaction.date,
      excluded: transaction.excluded,
      merchant_id: transaction.merchant?.id ?? "",
      name: transaction.name,
      notes: transaction.notes ?? "",
      tag_ids: transaction.tags.map((tag) => tag.id),
    },
  });

  function saveField(field: string, value: unknown, baseline: unknown) {
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
                  saveField("merchant_id", merchantId || null, transaction.merchant?.id ?? "");
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
                saveField("category_id", categoryId || null, transaction.category?.id ?? "");
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
    mutationFn: (input: { method: "existing"; matched_entry_id: string }) =>
      createTransferMatch(bootstrap.apiPaths.transactions, transaction.id, input),
    onError: (error) => {
      setMatcherError(error instanceof TransactionApiError ? error.message : "Match failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transaction.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
    },
  });

  const candidates = candidatesQuery.data?.candidates ?? [];
  const isOutflow = transaction.signed_amount_cents > 0;

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
            const counterpart = isOutflow
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
                    match.mutate({ matched_entry_id: counterpart.id, method: "existing" });
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
