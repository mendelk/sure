import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { updateTransferStatus, type SpaTransaction } from "../api/transactions";
import type { SpaBootstrap } from "../bootstrap";
import { Icon } from "../icon";
import type { AccountId, CategoryId, MerchantId, TransactionId } from "../ids";
import { useDismiss } from "../use-dismiss";
import { IconButton } from "./icon-button";

export function TransactionRow({
  accountId,
  amount,
  badges,
  category,
  columns,
  logoUrl,
  positive,
  selection,
  transaction,
}: {
  accountId?: AccountId;
  amount?: string;
  badges?: ReactNode;
  category?: ReactNode;
  columns: { merchant: boolean; notes: boolean; tags: boolean };
  logoUrl?: string | null;
  positive?: boolean;
  selection?: {
    selected: boolean;
    disabled: boolean;
    onChange: (value: boolean) => void;
    label: string;
  };
  transaction: SpaTransaction;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const categoryName =
    transaction.category?.name ??
    (transaction.classification === "income" ? "Income" : "Uncategorized");

  return (
    <li
      className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-container-hover sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.45fr)_auto] ${
        transaction.excluded ? "opacity-50" : ""
      }`}
      id={`entry_${transaction.entry_id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
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
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-container-inset text-sm font-semibold text-secondary"
        >
          {logoUrl !== undefined && logoUrl !== null && logoUrl !== "" ? (
            <img alt="" className="size-10 rounded-full object-cover" src={logoUrl} />
          ) : (
            transaction.name.slice(0, 1).toUpperCase()
          )}
        </div>
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
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-secondary">
            {transaction.merchant && columns.merchant ? (
              <MerchantMenu
                bootstrap={bootstrap}
                categoryId={transaction.category?.id}
                categoryName={transaction.category?.name}
                merchantId={transaction.merchant.id}
                merchantName={transaction.merchant.name}
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
          {columns.notes &&
          typeof transaction.notes === "string" &&
          transaction.notes.length > 0 ? (
            <p className="mt-0.5 truncate text-xs text-tertiary" title={transaction.notes}>
              {transaction.notes}
            </p>
          ) : null}
          {columns.tags && transaction.tags.length > 0 ? (
            <p className="mt-1 flex flex-wrap gap-1">
              {transaction.tags.slice(0, 3).map((tag) => (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-primary"
                  key={tag.id}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={
                      typeof tag.color === "string" && tag.color.length > 0
                        ? { backgroundColor: tag.color }
                        : undefined
                    }
                  />
                  {tag.name}
                </span>
              ))}
              {transaction.tags.length > 3 ? (
                <span className="text-[11px] text-secondary">+{transaction.tags.length - 3}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        {category ?? (
          <>
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-container-inset"
              style={
                typeof transaction.category?.color === "string" &&
                transaction.category.color.length > 0
                  ? { backgroundColor: transaction.category.color }
                  : undefined
              }
            />
            <span className="truncate text-sm text-secondary">{categoryName}</span>
          </>
        )}
      </div>

      <p
        className={`privacy-sensitive text-right text-sm font-medium tabular-nums ${
          (positive ?? transaction.signed_amount_cents > 0) ? "text-success" : "text-primary"
        }`}
      >
        {amount ?? transaction.amount}
      </p>
    </li>
  );
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
      updateTransferStatus(bootstrap.apiPaths.transfers, transfer.id, { status }),
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
  bootstrap,
  categoryId,
  categoryName,
  merchantId,
  merchantName,
  transactionId,
}: {
  bootstrap: {
    railsPaths: {
      familyMerchants: string;
      newRule: string;
      transactions: string;
    };
  };
  categoryId?: CategoryId;
  categoryName?: string;
  merchantId: MerchantId;
  merchantName: string;
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

  const editHref = `${bootstrap.railsPaths.familyMerchants}/${merchantId}/edit`;
  const ruleHref =
    categoryId === undefined || categoryId.length === 0
      ? null
      : `${bootstrap.railsPaths.newRule}?${new URLSearchParams({
          resource_type: "transaction",
          merchant_id: merchantId,
          action_type: "set_transaction_category",
          action_value: categoryId,
        }).toString()}`;

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
            <div className="px-1" role="none">
              <a
                className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                data-turbo-frame="modal"
                href={editHref}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
                role="menuitem"
                tabIndex={-1}
              >
                <Icon name="pencil" size="sm" />
                <span className="min-w-0 wrap-break-word text-sm text-primary">
                  Edit {merchantName}
                </span>
              </a>
            </div>
            {ruleHref !== null && categoryName !== undefined && categoryName.length > 0 ? (
              <div className="px-1" role="none">
                <a
                  className="focus-ring flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-primary transition-colors hover:bg-container-hover"
                  data-turbo-frame="modal"
                  href={ruleHref}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                  }}
                  role="menuitem"
                  tabIndex={-1}
                >
                  <Icon name="plus" size="sm" />
                  <span className="min-w-0 wrap-break-word text-sm text-primary">
                    Always categorize {merchantName} as {categoryName}
                  </span>
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </span>
      <span aria-hidden="true" className="shrink-0 text-secondary">
        •
      </span>
    </span>
  );
}
