/* eslint-disable import/max-dependencies -- Drawer composes header, overview, details, and settings sections. */
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import {
  deleteTransfer,
  markTransferAsRecurring,
  requestTransfer,
  updateTransfer,
  type SpaTransfer,
  type TransferUpdatePayload,
} from "./api/transfers";
import type { SpaBootstrap } from "./bootstrap";
import { BrandLogo } from "./components/brand-logo";
import { Button } from "./components/button";
import { IconButton } from "./components/icon-button";
import { TagSelect } from "./components/tag-select";
import { Icon } from "./icon";
import { AccountIdSchema, TagIdSchema, TransferIdSchema, type TagId, type TransferId } from "./ids";
import { Modal } from "./modal";

function formatLongDate(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(document.documentElement.lang || "en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function AccountLogo({
  name,
  logoUrl,
  color,
}: {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
}) {
  const hasColor = typeof color === "string" && color.length > 0;
  return (
    <BrandLogo
      className="size-6 shrink-0 rounded-full border text-xs font-medium uppercase"
      src={logoUrl}
      style={{
        backgroundColor: hasColor ? `color-mix(in srgb, ${color} 15%, transparent)` : undefined,
        borderColor: hasColor ? `color-mix(in srgb, ${color} 30%, transparent)` : undefined,
        color: hasColor ? color : undefined,
      }}
    >
      {name.charAt(0)}
    </BrandLogo>
  );
}

export function TransferDetailDrawer({
  transferId: propTransferId,
  onClose,
}: {
  transferId?: TransferId;
  onClose?: () => void;
} = {}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const rawAccountId = typeof params.accountId === "string" ? params.accountId : undefined;
  const accountId =
    typeof rawAccountId === "string" && rawAccountId.length > 0
      ? AccountIdSchema.parse(rawAccountId)
      : undefined;

  const rawTransferId =
    propTransferId ?? (typeof params.transferId === "string" ? params.transferId : undefined);
  const transferId =
    typeof rawTransferId === "string" && rawTransferId.length > 0
      ? TransferIdSchema.parse(rawTransferId)
      : undefined;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const transferQuery = useQuery({
    queryKey: ["spa", "transfer", bootstrap.apiPaths.transfers, transferId ?? ""] as const,
    queryFn:
      transferId !== undefined
        ? ({ signal }) => requestTransfer(bootstrap.apiPaths.transfers, transferId, signal)
        : skipToken,
  });

  const transfer = transferQuery.data;

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (accountId) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId },
        resetScroll: false,
      });
    } else {
      void navigate({
        to: "/transactions",
        resetScroll: false,
      });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!transferId) return;
      await deleteTransfer(bootstrap.apiPaths.transfers, transferId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
      ]);
      close();
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove transfer");
    },
  });

  if (!transferId) return null;

  return (
    <>
      <Modal
        ariaLabelledby="transfer-detail-title"
        onClose={close}
        open
        panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-container p-0 shadow-border-xs lg:w-[550px]"
        placement="drawer"
      >
        <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
          {transferQuery.isError ? (
            <div className="rounded-xl border border-destructive bg-container p-5" role="alert">
              <p className="font-medium text-primary">Transfer unavailable</p>
              <p className="mt-1 text-sm text-secondary">{transferQuery.error.message}</p>
              <div className="mt-4 flex items-center gap-3">
                <Button className="text-sm font-medium" onClick={close} size="sm" variant="ghost">
                  Back to transactions
                </Button>
              </div>
            </div>
          ) : transferQuery.isPending || !transfer ? (
            <div className="animate-pulse space-y-4 p-4">
              <div className="h-8 w-48 rounded-sm bg-container-inset" />
              <div className="h-4 w-32 rounded-sm bg-container-inset" />
              <div className="mt-8 h-32 rounded-xl bg-container-inset" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1
                    className="flex items-center gap-2 text-2xl font-medium text-primary privacy-sensitive"
                    id="transfer-detail-title"
                  >
                    {transfer.amount}
                    <span className="text-lg font-normal text-secondary">{transfer.currency}</span>
                    <Icon className="text-secondary" name="arrow-left-right" size="sm" />
                  </h1>
                  <p className="mt-0.5 text-sm text-secondary">
                    {typeof transfer.name === "string" && transfer.name.length > 0
                      ? transfer.name
                      : transfer.transfer_type === "liability_payment"
                        ? `Payment to ${transfer.inflow_transaction.account.name}`
                        : `Transfer to ${transfer.inflow_transaction.account.name}`}
                  </p>
                </div>
                <IconButton icon="x" label="Close" onClick={close} />
              </div>

              {/* Overview Section */}
              <details className="group" open>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-medium uppercase text-secondary">Overview</span>
                  <Icon
                    className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
                    name="chevron-down"
                  />
                </summary>
                <div className="space-y-3 px-3 pt-2 pb-4 text-sm text-primary">
                  {/* From Account */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">From</span>
                      <div className="flex items-center gap-2 font-medium">
                        <AccountLogo
                          color={transfer.outflow_transaction.account.color}
                          logoUrl={transfer.outflow_transaction.account.logo_url}
                          name={transfer.outflow_transaction.account.name}
                        />
                        <Link
                          className="hover:underline"
                          params={{ accountId: transfer.outflow_transaction.account.id }}
                          to="/accounts/$accountId"
                        >
                          {transfer.outflow_transaction.account.name}
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">Date</span>
                      <span className="font-medium">
                        {formatLongDate(transfer.outflow_transaction.date)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">Transfer amount</span>
                      <Link
                        className="font-medium text-destructive hover:underline privacy-sensitive"
                        params={
                          accountId
                            ? { accountId, transactionId: transfer.outflow_transaction.id }
                            : { transactionId: transfer.outflow_transaction.id }
                        }
                        title="View transaction"
                        to={
                          accountId
                            ? "/accounts/$accountId/transactions/$transactionId"
                            : "/transactions/$transactionId"
                        }
                      >
                        -{transfer.amount}
                      </Link>
                    </div>

                    {Number(transfer.source_fee_amount) > 0 ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-secondary">Source fee</span>
                          <span className="font-medium text-destructive privacy-sensitive">
                            -{transfer.source_fee_amount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-secondary pt-1">
                          <span className="font-medium text-secondary">Total</span>
                          <span className="font-medium text-destructive privacy-sensitive">
                            -{transfer.amount}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <hr className="my-2 border-secondary" />

                  {/* To Account */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">To</span>
                      <div className="flex items-center gap-2 font-medium">
                        <AccountLogo
                          color={transfer.inflow_transaction.account.color}
                          logoUrl={transfer.inflow_transaction.account.logo_url}
                          name={transfer.inflow_transaction.account.name}
                        />
                        <Link
                          className="hover:underline"
                          params={{ accountId: transfer.inflow_transaction.account.id }}
                          to="/accounts/$accountId"
                        >
                          {transfer.inflow_transaction.account.name}
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">Date</span>
                      <span className="font-medium">
                        {formatLongDate(transfer.inflow_transaction.date)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-secondary">Transfer amount</span>
                      <Link
                        className="font-medium text-success hover:underline privacy-sensitive"
                        params={
                          accountId
                            ? { accountId, transactionId: transfer.inflow_transaction.id }
                            : { transactionId: transfer.inflow_transaction.id }
                        }
                        title="View transaction"
                        to={
                          accountId
                            ? "/accounts/$accountId/transactions/$transactionId"
                            : "/transactions/$transactionId"
                        }
                      >
                        +{transfer.amount}
                      </Link>
                    </div>

                    {Number(transfer.destination_fee_amount) > 0 ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-secondary">Destination fee</span>
                          <span className="font-medium text-destructive privacy-sensitive">
                            -{transfer.destination_fee_amount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-secondary pt-1">
                          <span className="font-medium text-secondary">Total</span>
                          <span className="font-medium text-success privacy-sensitive">
                            +{transfer.amount}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </details>

              {/* Details Section */}
              <TransferDetailsSection
                bootstrap={bootstrap}
                key={`${transfer.id}-${transfer.updated_at}`}
                transfer={transfer}
                transferId={transferId}
              />

              {/* Settings Section */}
              <TransferSettingsSection
                bootstrap={bootstrap}
                onDeleteRequest={() => {
                  setShowDeleteConfirm(true);
                }}
                transfer={transfer}
                transferId={transferId}
              />
            </>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm ? (
        <Modal
          ariaLabelledby="remove-transfer-title"
          layer="above"
          onClose={() => {
            setShowDeleteConfirm(false);
          }}
          open={showDeleteConfirm}
          panelClassName="relative flex w-full max-w-md flex-col rounded-xl bg-container p-5 shadow-border-xs"
          placement="center"
        >
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary" id="remove-transfer-title">
              Remove transfer?
            </h3>
            <p className="text-sm text-secondary">
              This removes the transfer. It will not delete the underlying transactions.
            </p>
            {typeof deleteError === "string" && deleteError.length > 0 ? (
              <p className="text-xs text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setShowDeleteConfirm(false);
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate();
                }}
                variant="destructive"
              >
                {deleteMutation.isPending ? "Removing…" : "Remove transfer"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function TransferDetailsSection({
  bootstrap,
  transfer,
  transferId,
}: {
  bootstrap: SpaBootstrap;
  transfer: SpaTransfer;
  transferId: TransferId;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(transfer.notes ?? "");
  const [selectedTagIds, setSelectedTagIds] = useState<TagId[]>(
    transfer.tags.map((t) => TagIdSchema.parse(t.id)),
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");

  const updateMutation = useMutation({
    mutationFn: async (payload: TransferUpdatePayload) => {
      await updateTransfer(bootstrap.apiPaths.transfers, transferId, payload);
    },
    onSuccess: async () => {
      setSaveStatus("idle");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["spa", "transfer", bootstrap.apiPaths.transfers, transferId],
        }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transaction"] }),
      ]);
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  return (
    <details className="group" open>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium uppercase text-secondary">Details</span>
        <Icon
          className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
          name="chevron-down"
        />
      </summary>
      <div className="space-y-4 px-3 pt-2 pb-4">
        {/* Tags */}
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-secondary">Tags</span>
          <TagSelect
            bootstrap={bootstrap}
            initialTags={transfer.tags}
            onSelect={async (newTagIds) => {
              setSelectedTagIds(newTagIds);
              await updateMutation.mutateAsync({ tag_ids: newTagIds });
            }}
            placeholder="(none)"
            selectedTagIds={selectedTagIds}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-medium uppercase tracking-wide text-secondary"
              htmlFor="transfer-notes"
            >
              Notes
            </label>
            {saveStatus === "saving" ? (
              <span className="text-xs text-secondary">Saving…</span>
            ) : saveStatus === "error" ? (
              <span className="text-xs text-destructive">Failed to save</span>
            ) : null}
          </div>
          <textarea
            className="w-full resize-none rounded-xl border border-secondary bg-container px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
            id="transfer-notes"
            onBlur={() => {
              if (notes !== (transfer.notes ?? "")) {
                setSaveStatus("saving");
                updateMutation.mutate({ notes: notes.trim() });
              }
            }}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            placeholder="Add a note to this transfer"
            rows={5}
            value={notes}
          />
        </div>
      </div>
    </details>
  );
}

function TransferSettingsSection({
  bootstrap,
  transfer,
  transferId,
  onDeleteRequest,
}: {
  bootstrap: SpaBootstrap;
  transfer: SpaTransfer;
  transferId: TransferId;
  onDeleteRequest: () => void;
}) {
  const queryClient = useQueryClient();
  const [recurringSuccess, setRecurringSuccess] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const recurringMutation = useMutation({
    mutationFn: async () => {
      await markTransferAsRecurring(bootstrap.apiPaths.transfers, transferId);
    },
    onSuccess: async () => {
      setRecurringSuccess(true);
      setRecurringError(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["spa", "transfer", bootstrap.apiPaths.transfers, transferId],
        }),
        queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] }),
      ]);
    },
    onError: (err) => {
      setRecurringError(err instanceof Error ? err.message : "Failed to mark as recurring");
    },
  });

  const canMarkAsRecurring =
    transfer.can_mark_as_recurring !== false &&
    transfer.recurring_exists !== true &&
    !recurringSuccess;

  return (
    <details className="group" open>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium uppercase text-secondary">Settings</span>
        <Icon
          className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
          name="chevron-down"
        />
      </summary>
      <div className="space-y-4 px-3 pt-2 pb-4">
        {/* Recurring */}
        {canMarkAsRecurring ? (
          <div className="flex flex-col gap-3 rounded-xl border border-secondary p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <h4 className="font-medium text-primary">Mark transfer as recurring</h4>
              <p className="text-xs text-secondary">
                Track this transfer as a recurring pattern in the upcoming feed and recurring page.
              </p>
              {typeof recurringError === "string" && recurringError.length > 0 ? (
                <p className="text-xs text-destructive" role="alert">
                  {recurringError}
                </p>
              ) : null}
            </div>
            <Button
              className="flex shrink-0 items-center gap-1.5"
              disabled={recurringMutation.isPending}
              onClick={() => {
                recurringMutation.mutate();
              }}
              size="sm"
              variant="secondary"
            >
              <Icon name="arrow-left-right" size="sm" />
              {recurringMutation.isPending ? "Marking…" : "Mark as recurring"}
            </Button>
          </div>
        ) : transfer.recurring_exists === true || recurringSuccess ? (
          <div className="flex items-center gap-2 rounded-xl border border-secondary p-3 text-sm text-secondary">
            <Icon className="text-success" name="check" size="sm" />
            <span>This transfer is marked as recurring</span>
          </div>
        ) : null}

        {/* Remove Transfer */}
        <div className="flex flex-col gap-3 rounded-xl border border-secondary p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <h4 className="font-medium text-primary">Remove transfer?</h4>
            <p className="text-xs text-secondary">
              This removes the transfer. It will not delete the underlying transactions.
            </p>
          </div>
          <Button
            className="shrink-0"
            onClick={onDeleteRequest}
            size="sm"
            variant="destructive-outline"
          >
            Remove transfer
          </Button>
        </div>
      </div>
    </details>
  );
}
