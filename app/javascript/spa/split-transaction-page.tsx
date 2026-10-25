/* eslint-disable import/max-dependencies -- Split form composes detail query, reference data, pickers, routing, and API operations. */
import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod/mini";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { TagSelect } from "./components/tag-select";
import { Modal } from "./modal";
import {
  readCsrfToken,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  type ReferenceOption,
} from "./api/transactions";
import { CategorySelect } from "./transaction-detail-page";
import { SearchablePicker, type PickerOption } from "./components/searchable-picker";
import {
  AccountIdSchema,
  CategoryIdSchema,
  TagIdSchema,
  TransactionIdSchema,
  type AccountId,
  type CategoryId,
  type TagId,
  type TransactionId,
} from "./ids";
type SplitRow = {
  key: number;
  name: string;
  amount: string;
  categoryId: CategoryId | "";
  categoryName?: string | null;
  initialTags?: ReferenceOption<TagId>[];
  notes?: string | null;
  tagIds: TagId[];
  transferAccountId: AccountId | "";
};

function newRow(key: number, name: string, amount: string): SplitRow {
  return { key, amount, categoryId: "", name, tagIds: [], transferAccountId: "" };
}

function TransferAccountSelect({
  accounts,
  disabled,
  excludeAccountId,
  onSelect,
  selectedAccountId,
}: {
  accounts: ReferenceOption<AccountId>[];
  disabled?: boolean;
  excludeAccountId?: string;
  onSelect: (accountId: AccountId | "") => void;
  selectedAccountId: AccountId | "";
}) {
  const [query, setQuery] = useState("");
  const selectable = accounts.filter(
    (account) => account.id !== excludeAccountId && account.permissions?.can_edit === true,
  );
  const selected = selectable.find((account) => account.id === selectedAccountId);
  const lowerQuery = query.trim().toLowerCase();
  const options: PickerOption[] = [
    { value: "", label: "No transfer" },
    ...selectable
      .filter((account) => account.name.toLowerCase().includes(lowerQuery))
      .map((account) => ({ value: account.id, label: account.name })),
  ];

  return (
    <SearchablePicker
      disabled={disabled}
      label="Transfer to"
      onQueryChange={setQuery}
      onSelect={(value) => {
        if (value === "") {
          onSelect("");
          return true;
        }
        const account = selectable.find((candidate) => candidate.id === value);
        if (account === undefined) return false;
        onSelect(account.id);
        return true;
      }}
      options={options}
      query={query}
      searchLabel="Search accounts"
      selectedValues={[selectedAccountId]}
      trigger={
        selected ? (
          <span className="truncate text-sm text-primary">{selected.name}</span>
        ) : (
          <span className="text-sm text-secondary">No transfer</span>
        )
      }
    />
  );
}

async function submitSplit(
  basePath: string,
  transactionId: TransactionId,
  mode: "create" | "update",
  rows: {
    amount: number;
    category_id: string | null;
    name: string;
    notes?: string;
    tag_ids: TagId[];
    transfer_account_id: string | null;
  }[],
): Promise<void> {
  const response = await fetch(`${basePath}/${transactionId}/split`, {
    body: JSON.stringify({
      split: {
        splits: rows.map((row) => ({
          amount: row.amount,
          category_id: row.category_id,
          name: row.name,
          ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
          tag_ids: row.tag_ids,
          transfer_account_id: row.transfer_account_id,
        })),
      },
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method: mode === "create" ? "POST" : "PATCH",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    let message = `Split failed with status ${response.status}`;
    if (typeof payload === "object" && payload !== null && "message" in payload) {
      const rawMessage: unknown = payload.message;
      if (typeof rawMessage === "string") message = rawMessage;
    }
    throw new Error(message);
  }
}

function parseAmountToCashFlow(raw: string, isInflow: boolean): number | null {
  const trimmed = raw.trim().replaceAll(/[$,\s]/gu, "");
  if (!/^-?\d+(\.\d{1,2})?$/u.test(trimmed)) return null;
  const absolute = Math.abs(Number(trimmed));
  if (!Number.isFinite(absolute)) return null;
  return isInflow ? absolute : -absolute;
}

export function SplitTransactionPage({ mode }: { mode: "create" | "update" }) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transactionId = TransactionIdSchema.parse(params.transactionId);

  const detailQuery = useQuery(
    transactionDetailQueryOptions(bootstrap.apiPaths.transactions, transactionId),
  );
  const detail = detailQuery.data;

  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  );
  const categories: ReferenceOption<CategoryId>[] = referenceQuery.data?.categories ?? [];
  const accounts = referenceQuery.data?.accounts ?? [];
  const tags = referenceQuery.data?.tags ?? [];

  // Parent total in cash-flow terms, matching the API contract (negative =
  // outflow). Prefill existing children in edit mode once loaded.
  const [rows, setRows] = useState<SplitRow[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parentAmount = detail ? detail.signed_amount_cents / 100 : 0;
  const isInflow = parentAmount > 0;

  const activeRows =
    rows ??
    (mode === "update" && detail?.split_children
      ? detail.split_children.map((child, index) => ({
          amount: String(Math.abs(Number(child.amount.replaceAll(/[^0-9.-]/gu, "")) || 0)),
          categoryId: child.category_id ?? "",
          initialTags: child.tags,
          key: index,
          name: child.name,
          notes: child.notes,
          tagIds: child.tags.map((tag) => tag.id),
          transferAccountId: child.transfer_account_id ?? "",
        }))
      : [newRow(0, detail?.name ?? "", ""), newRow(1, "", "")]);

  function isFundsMovement(row: SplitRow): boolean {
    if (row.transferAccountId === "") return false;
    // Incoming split legs are always funds movements, regardless of the source account.
    if (isInflow) return true;

    const targetType = accounts.find(
      (account) => account.id === row.transferAccountId,
    )?.accountType;
    if (targetType === undefined) return false;
    if (["loan", "credit_card", "other_liability"].includes(targetType)) return false;
    const sourceType = detail?.account.account_type;
    const sourceIsInvestment = sourceType === "investment" || sourceType === "crypto";
    const targetIsInvestment = targetType === "investment" || targetType === "crypto";
    return !targetIsInvestment || sourceIsInvestment;
  }

  function updateRow(key: number, patch: Partial<SplitRow>) {
    const next = activeRows.map((row) => (row.key === key ? { ...row, ...patch } : row));
    setRows(next);
  }

  function addRow() {
    const nextKey = activeRows.reduce((maxKey, row) => Math.max(maxKey, row.key), -1) + 1;
    setRows([...activeRows, newRow(nextKey, "", "")]);
  }

  function removeRow(key: number) {
    if (activeRows.length <= 1) return;
    setRows(activeRows.filter((row) => row.key !== key));
  }

  const parsed = activeRows.map((row) => parseAmountToCashFlow(row.amount, isInflow));
  const total: number = parsed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const remaining: number = parentAmount - total;
  const allValid =
    activeRows.length > 0 &&
    activeRows.every((row) => row.name.trim().length > 0) &&
    parsed.every((value) => value !== null) &&
    Math.abs(remaining) < 0.005;

  function close() {
    void navigate({
      params: { transactionId },
      resetScroll: false,
      search: true,
      to: "/transactions/$transactionId",
    });
  }

  const mutation = useMutation({
    mutationFn: () =>
      submitSplit(
        bootstrap.apiPaths.transactions,
        transactionId,
        mode,
        activeRows.map((row, index) => ({
          amount: parsed[index] ?? 0,
          category_id:
            isFundsMovement(row) || row.categoryId === ""
              ? null
              : CategoryIdSchema.parse(row.categoryId),
          name: row.name.trim(),
          ...(typeof row.notes === "string" ? { notes: row.notes } : {}),
          tag_ids: row.tagIds,
          transfer_account_id:
            row.transferAccountId === "" ? null : AccountIdSchema.parse(row.transferAccountId),
        })),
      ),
    onError: (caught) => {
      setSubmitError(caught instanceof Error ? caught.message : "Could not save split");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
      void queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transactionId],
      });
      close();
    },
  });

  if (detail?.permissions.can_edit !== true) {
    return (
      <Modal
        onClose={close}
        open
        panelClassName="w-full max-w-xl rounded-xl bg-container p-4 shadow-lg"
      >
        <div className="flex items-center justify-between gap-4">
          <DialogTitle className="text-lg font-medium text-primary">Split unavailable</DialogTitle>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>
        {detail ? (
          <Alert live="alert" variant="warning">
            You need full control of this account to split its transactions.
          </Alert>
        ) : detailQuery.isError ? (
          <Alert live="alert" variant="error">
            Could not load the transaction.
          </Alert>
        ) : (
          <output className="text-sm text-secondary" aria-live="polite">
            Loading transaction…
          </output>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      onClose={() => {
        if (!mutation.isPending) close();
      }}
      open
      panelClassName="w-full max-w-xl overflow-hidden rounded-xl bg-container shadow-lg"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-tertiary p-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              {mode === "create" ? "Split Transaction" : "Edit Split"}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">
              {detail.name} · {detail.account.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-secondary">Total</span>
            <span className="privacy-sensitive text-lg font-medium tabular-nums text-primary">
              {detail.amount}
            </span>
            <IconButton disabled={mutation.isPending} icon="x" label="Close" onClick={close} />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {detailQuery.error ? (
            <Alert live="alert" variant="error">
              Could not load the transaction.
            </Alert>
          ) : null}
          {submitError !== null ? (
            <Alert live="alert" variant="error">
              {submitError}
            </Alert>
          ) : null}

          {activeRows.map((row) => (
            <div
              className="space-y-2 rounded-lg border border-secondary bg-container p-3"
              key={row.key}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <FormField
                    disabled={mutation.isPending}
                    id={`split-name-${row.key}`}
                    label="Name"
                    onChange={(event) => {
                      updateRow(row.key, { name: event.target.value });
                    }}
                    placeholder="Split name"
                    type="text"
                    value={row.name}
                  />
                </div>
                <div className="min-w-28 max-w-36 flex-1 basis-28">
                  <FormField
                    disabled={mutation.isPending}
                    id={`split-amount-${row.key}`}
                    label="Amount"
                    onChange={(event) => {
                      updateRow(row.key, { amount: event.target.value });
                    }}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={row.amount}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <CategorySelect
                    bootstrap={bootstrap}
                    categories={categories}
                    disabled={referenceQuery.isPending || mutation.isPending}
                    initialCategory={null}
                    notApplicableLabel={
                      isFundsMovement(row)
                        ? bootstrap.accountDetailText.category_not_applicable
                        : undefined
                    }
                    onSelect={(categoryId) => {
                      updateRow(row.key, { categoryId });
                    }}
                    selectedCategoryId={row.categoryId}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-48">
                  <TransferAccountSelect
                    accounts={accounts}
                    disabled={referenceQuery.isPending || mutation.isPending}
                    excludeAccountId={detail.account.id}
                    onSelect={(accountId) => {
                      updateRow(row.key, { transferAccountId: accountId });
                    }}
                    selectedAccountId={row.transferAccountId}
                  />
                </div>
                {activeRows.length > 1 ? (
                  <Button
                    aria-label="Remove split row"
                    disabled={mutation.isPending}
                    onClick={() => {
                      removeRow(row.key);
                    }}
                    variant="ghost"
                  >
                    ×
                  </Button>
                ) : null}
              </div>
              <TagSelect
                bootstrap={bootstrap}
                disabled={referenceQuery.isPending || mutation.isPending}
                initialTags={row.initialTags}
                onSelect={(tagIds) => {
                  updateRow(row.key, { tagIds });
                }}
                selectedTagIds={row.tagIds}
                tags={tags}
              />
            </div>
          ))}

          <Button
            className="border-dashed"
            disabled={mutation.isPending}
            fullWidth
            iconProps={{ name: "plus", size: "sm" }}
            onClick={addRow}
            variant="outline_muted"
          >
            Add split
          </Button>

          <div
            className={`rounded-lg border p-3 text-sm ${Math.abs(remaining) < 0.005 ? "border-secondary bg-container" : "border-destructive"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-secondary">Remaining</span>
              <span
                className={`font-semibold tabular-nums ${Math.abs(remaining) < 0.005 ? "text-primary" : "text-destructive"}`}
              >
                {remaining.toFixed(2)}
              </span>
            </div>
            {Math.abs(remaining) >= 0.005 ? (
              <p className="mt-1.5 text-xs text-destructive">
                Split amounts must equal the original transaction amount.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-tertiary p-4">
          <Button disabled={mutation.isPending} onClick={close} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={!allValid || mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
            variant="primary"
          >
            {mode === "create" ? "Split Transaction" : "Update Split"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function validateTransactionIdParam(input: Record<string, unknown>): TransactionId {
  return TransactionIdSchema.parse(input.transactionId);
}

export const SplitFormSchema = z.object({
  splits: z.array(
    z.object({
      amount: z.number(),
      category_id: z.nullish(z.string()),
      name: z.string(),
      notes: z.optional(z.string()),
      tag_ids: z.array(TagIdSchema),
      transfer_account_id: z.nullish(z.string()),
    }),
  ),
});
