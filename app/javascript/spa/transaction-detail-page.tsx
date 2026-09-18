import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { Icon } from "./icon";
import {
  TransactionApiError,
  transactionDetailQueryOptions,
  type SpaTransactionDetail,
} from "./api/transactions";

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
    void navigate({ to: "/transactions" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-overlay pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:p-3">
      <button
        aria-label="Close transaction details"
        className="absolute inset-0 size-full cursor-default"
        onClick={close}
        type="button"
      />
      <dialog
        aria-labelledby="transaction-detail-title"
        className="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
        open
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
              <TransactionDetailOverview transaction={transaction} />
              {transaction.transfer ? (
                <TransactionDetailTransfer transaction={transaction} />
              ) : null}
              <TransactionDetailBody transaction={transaction} />
              <TransactionDetailMeta transaction={transaction} />
            </>
          )}
        </div>
      </dialog>
    </div>
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
          <div className="mt-1 flex items-center gap-2">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details
      className="group overflow-hidden rounded-xl bg-container shadow-border-xs"
      open={title === "Overview"}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-primary focus-ring [&::-webkit-details-marker]:hidden">
        {title}
        <Icon name="chevron-right" className="transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-tertiary px-4 py-4">{children}</div>
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

function TransactionDetailOverview({ transaction }: { transaction: SpaTransactionDetail }) {
  return (
    <Section title="Overview">
      <dl className="space-y-3">
        <Field label="Name" value={transaction.name} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" value={formatLongDate(transaction.date)} />
          <Field
            label="Nature"
            value={transaction.signed_amount_cents > 0 ? "Income" : "Expense"}
          />
        </div>
        <Field label="Amount" value={`${transaction.amount} ${transaction.currency}`} />
        <Field label="Category" value={transaction.category?.name ?? "Uncategorized"} />
      </dl>
    </Section>
  );
}

function TransactionDetailTransfer({ transaction }: { transaction: SpaTransactionDetail }) {
  const transfer = transaction.transfer;
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
        <span className="inline-flex items-center gap-1 rounded-full bg-container-inset px-2 py-0.5 text-[11px] font-medium text-secondary">
          <Icon name="arrow-left-right" />
          Transfer
        </span>
      </div>
    </Section>
  );
}

function TransactionDetailBody({ transaction }: { transaction: SpaTransactionDetail }) {
  return (
    <Section title="Details">
      <dl className="space-y-3">
        <Field label="Account" value={transaction.account.name} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Merchant" value={transaction.merchant?.name ?? "None"} />
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

function TransactionDetailMeta({ transaction }: { transaction: SpaTransactionDetail }) {
  return (
    <Section title="Additional details">
      <dl className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status" value={transaction.pending ? "Pending" : "Posted"} />
          <Field label="Excluded" value={transaction.excluded ? "Yes" : "No"} />
        </div>
        {transaction.external_id !== undefined &&
        transaction.external_id !== null &&
        transaction.external_id !== "" ? (
          <Field label="External ID" value={transaction.external_id} />
        ) : null}
        {transaction.source !== undefined &&
        transaction.source !== null &&
        transaction.source !== "" ? (
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
