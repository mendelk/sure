/* eslint-disable import/max-dependencies -- Matcher form composes detail/candidates/accounts queries, pickers, routing, and API operations. */
import { DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { SearchablePicker } from "./components/searchable-picker";
import {
  TransactionApiError,
  createTransferMatch,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  transferMatchCandidatesQueryOptions,
  type ReferenceOption,
  type TransferMatchCandidates,
} from "./api/transactions";
import { AccountIdSchema, TransactionIdSchema, type AccountId, type TransactionId } from "./ids";

import { fuzzyFilter } from "./fuzzy";
type Candidate = TransferMatchCandidates["candidates"][number];

function counterpartFor(candidate: Candidate, transactionId: TransactionId) {
  return candidate.outflow_transaction_id === transactionId
    ? candidate.inflow_transaction
    : candidate.outflow_transaction;
}

function CandidateSelect({
  candidates,
  disabled,
  onSelect,
  selectedId,
  transactionId,
}: {
  candidates: Candidate[];
  disabled: boolean;
  onSelect: (id: TransactionId | "") => void;
  selectedId: TransactionId | "";
  transactionId: TransactionId;
}) {
  const [query, setQuery] = useState("");
  const selected =
    candidates.find((candidate) => counterpartFor(candidate, transactionId).id === selectedId) ??
    null;
  const options = fuzzyFilter(candidates, query, (candidate) => {
    const counterpart = counterpartFor(candidate, transactionId);
    return [counterpart.name, counterpart.account.name];
  }).map((candidate) => {
    const counterpart = counterpartFor(candidate, transactionId);
    return {
      value: counterpart.id,
      label: counterpart.name,
      content: (
        <span className="min-w-0">
          <span className="block truncate font-medium">{counterpart.name}</span>
          <span className="block truncate text-xs text-secondary">
            {counterpart.account.name} · {counterpart.date} · {counterpart.amount}
            {candidate.date_diff > 0 ? ` · ${candidate.date_diff}d apart` : ""}
          </span>
        </span>
      ),
    };
  });

  return (
    <SearchablePicker
      disabled={disabled}
      label="Matching transaction"
      onQueryChange={setQuery}
      onSelect={(value) => {
        const match = candidates.find(
          (candidate) => counterpartFor(candidate, transactionId).id === value,
        );
        if (match === undefined) return false;
        onSelect(counterpartFor(match, transactionId).id);
        return true;
      }}
      options={options}
      query={query}
      searchLabel="Search possible matches"
      selectedValues={selectedId === "" ? [] : [selectedId]}
      trigger={
        selected ? (
          <span className="truncate text-sm text-primary">
            {counterpartFor(selected, transactionId).name}
          </span>
        ) : (
          <span className="text-sm text-secondary">Select a transaction</span>
        )
      }
    />
  );
}

function TargetAccountSelect({
  accounts,
  disabled,
  excludeAccountId,
  onSelect,
  selectedId,
}: {
  accounts: ReferenceOption<AccountId>[];
  disabled: boolean;
  excludeAccountId?: string;
  onSelect: (id: AccountId | "") => void;
  selectedId: AccountId | "";
}) {
  const [query, setQuery] = useState("");
  const selectable = accounts.filter(
    (account) => account.id !== excludeAccountId && account.permissions?.can_edit === true,
  );
  const selected = selectable.find((account) => account.id === selectedId);
  const options = fuzzyFilter(selectable, query, (account) => account.name).map((account) => ({
    label: account.name,
    value: account.id,
  }));

  return (
    <SearchablePicker
      disabled={disabled}
      label="Target account"
      onQueryChange={setQuery}
      onSelect={(value) => {
        const account = selectable.find((candidate) => candidate.id === value);
        if (account === undefined) return false;
        onSelect(account.id);
        return true;
      }}
      options={options}
      query={query}
      searchLabel="Search accounts"
      selectedValues={selectedId === "" ? [] : [selectedId]}
      trigger={
        selected ? (
          <span className="truncate text-sm text-primary">{selected.name}</span>
        ) : (
          <span className="text-sm text-secondary">Select an account</span>
        )
      }
    />
  );
}

export function TransferMatchPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transactionId = TransactionIdSchema.parse(params.transactionId);

  const detailQuery = useQuery(
    transactionDetailQueryOptions(bootstrap.apiPaths.transactions, transactionId),
  );
  const detail = detailQuery.data;
  const candidatesQuery = useQuery(
    transferMatchCandidatesQueryOptions(bootstrap.apiPaths.transactions, transactionId),
  );
  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  );

  const writableAccounts =
    referenceQuery.data?.accounts.filter((account) => account.permissions?.can_edit === true) ?? [];
  const candidates = (candidatesQuery.data?.candidates ?? []).filter((candidate) =>
    writableAccounts.some(
      (account) => account.id === counterpartFor(candidate, transactionId).account.id,
    ),
  );
  const [method, setMethod] = useState<"existing" | "new">("existing");

  // Default to creating a counterpart when nothing can be matched: mirrors the
  // Rails modal, which renders only the target-account picker in that case.
  const effectiveMethod: "existing" | "new" =
    candidatesQuery.data && candidates.length === 0 ? "new" : method;

  const [selectedCounterpartId, setSelectedCounterpartId] = useState<TransactionId | "">("");
  const [targetAccountId, setTargetAccountId] = useState<AccountId | "">("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Current side first (it stays fixed), counterpart slot second — same layout
  // as the Rails modal's from/to sections. Negative entry amounts are inflows.
  const isInflow = (detail?.signed_amount_cents ?? 0) < 0;
  const currentLabel = isInflow
    ? `To account: ${detail?.account.name ?? ""}`
    : `From account: ${detail?.account.name ?? ""}`;
  const counterpartLabel = isInflow
    ? "From account"
    : `To account${detail ? `: ${detail.account.name}` : ""}`;

  const selectedCandidate =
    selectedCounterpartId === ""
      ? null
      : (candidates.find(
          (candidate) => counterpartFor(candidate, transactionId).id === selectedCounterpartId,
        ) ?? null);

  const canSubmit =
    detail !== undefined &&
    (effectiveMethod === "existing"
      ? selectedCandidate !== null
      : targetAccountId !== "" && targetAccountId !== detail.account.id);

  function close() {
    void navigate({
      params: { transactionId },
      resetScroll: false,
      search: true,
      to: "/transactions/$transactionId",
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (effectiveMethod === "existing") {
        if (selectedCandidate === null)
          throw new TransactionApiError("Select a transaction to match", 0);
        const counterpart = await queryClient.query(
          transactionDetailQueryOptions(
            bootstrap.apiPaths.transactions,
            counterpartFor(selectedCandidate, transactionId).id,
          ),
        );
        await createTransferMatch(bootstrap.apiPaths.transactions, transactionId, {
          method: "existing",
          matched_entry_id: counterpart.entry_id,
        });
      } else {
        if (targetAccountId === "") throw new TransactionApiError("Select a target account", 0);
        await createTransferMatch(bootstrap.apiPaths.transactions, transactionId, {
          method: "new",
          target_account_id: AccountIdSchema.parse(targetAccountId),
        });
      }
    },
    onError: (caught) => {
      setSubmitError(caught instanceof Error ? caught.message : "Could not create match");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["spa", "transaction", bootstrap.apiPaths.transactions, transactionId],
      });
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "summary"] });
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
          <DialogTitle className="text-lg font-medium text-primary">Transfer matching</DialogTitle>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>
        {detail ? (
          <Alert live="alert" variant="warning">
            You need full control of this account to match its transactions.
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
      onClose={close}
      open
      panelClassName="w-full max-w-xl overflow-hidden rounded-xl bg-container shadow-lg"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-tertiary p-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              Match transfer or payment
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">
              Match the corresponding transaction in another account or create one if it
              doesn&apos;t exist.
            </p>
            <p className="mt-0.5 text-sm text-secondary">
              {detail.name} · {detail.account.name} · {detail.amount} {detail.currency}
            </p>
          </div>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {detailQuery.error ? (
            <Alert live="alert" variant="error">
              Could not load the transaction.
            </Alert>
          ) : null}
          {candidatesQuery.error ? (
            <Alert live="alert" variant="error">
              Could not load possible matches.
            </Alert>
          ) : null}
          {submitError !== null ? (
            <Alert live="alert" variant="error">
              {submitError}
            </Alert>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-secondary">{currentLabel}</h2>
            <div className="rounded-lg border border-secondary bg-container p-3">
              <p className="text-sm font-medium text-primary">{detail.name}</p>
              <p className="text-xs text-secondary">
                {detail.account.name} · {detail.date}
              </p>
            </div>
          </section>

          <div aria-hidden="true" className="flex justify-center py-1 text-secondary">
            <Icon name="chevron-down" />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-secondary">{counterpartLabel}</h2>
            {candidates.length > 0 ? (
              <>
                <p className="text-sm text-secondary">
                  Select a method for matching your transactions.
                </p>
                <div
                  aria-label="Matching method"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-container-inset p-1"
                  role="tablist"
                >
                  {(
                    [
                      ["existing", "Match existing"],
                      ["new", "Create new"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      aria-selected={effectiveMethod === value}
                      key={value}
                      onClick={() => {
                        setMethod(value);
                        setSubmitError(null);
                      }}
                      role="tab"
                      type="button"
                      variant={effectiveMethod === value ? "secondary" : "ghost"}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-secondary">
                We couldn&apos;t find any transactions to match from your other accounts. Please
                select an account and we will create a new inflow transaction for you.
              </p>
            )}

            {effectiveMethod === "existing" ? (
              candidatesQuery.isPending ? (
                <p className="text-sm text-secondary">Looking for possible matches…</p>
              ) : (
                <CandidateSelect
                  candidates={candidates}
                  disabled={mutation.isPending}
                  onSelect={(id) => {
                    setSelectedCounterpartId(id);
                    setSubmitError(null);
                  }}
                  selectedId={selectedCounterpartId}
                  transactionId={transactionId}
                />
              )
            ) : (
              <TargetAccountSelect
                accounts={writableAccounts}
                disabled={mutation.isPending || referenceQuery.isPending}
                excludeAccountId={detail.account.id}
                onSelect={(id) => {
                  setTargetAccountId(id);
                  setSubmitError(null);
                }}
                selectedId={targetAccountId}
              />
            )}
          </section>

          {targetAccountId !== "" &&
          effectiveMethod === "new" &&
          targetAccountId === detail.account.id ? (
            <Alert live="status" variant="warning">
              Choose an account other than the transaction&apos;s own account.
            </Alert>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-tertiary p-4">
          <Button onClick={close} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
            variant="primary"
          >
            Create transfer match
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function validateTransferMatchParam(input: Record<string, unknown>): TransactionId {
  return TransactionIdSchema.parse(input.transactionId);
}
