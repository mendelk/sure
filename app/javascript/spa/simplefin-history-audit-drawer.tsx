/* eslint-disable import/max-dependencies -- History audit composes routing, API access, shared controls, coverage, and transaction review. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useParams, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AUDIT_STATUSES,
  fetchHistoryAuditPage,
  historyAuditMetadataQueryOptions,
  HistoryAuditApiError,
  importHistoryAuditTransactions,
  type AuditImportDecision,
  type AuditMetadata,
  type AuditPage,
  type AuditRequest,
  type AuditTransaction,
} from "./api/simplefin-history-audit";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { DisclosureSection } from "./components/disclosure";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import { AccountIdSchema } from "./ids";
import { Modal } from "./modal";
import { parseReturnTo, useDialogClose } from "./return-to";

export function validateHistoryAuditSearch(input: Record<string, unknown>): { return_to: string } {
  return { return_to: parseReturnTo(input.return_to, "/accounts") };
}

const ATTENTION = new Set<AuditTransaction["status"]>([
  "missing",
  "possible_match",
  "invalid",
  "identity_conflict",
]);
type RequestMode = "start" | "next" | "retry";
type ReviewRow = AuditTransaction & { key: string; feedName: string; retired: boolean };

function identityKey(row: {
  simplefin_account_id: string;
  provider_transaction_id: string | null;
}): string {
  return JSON.stringify([row.simplefin_account_id, row.provider_transaction_id]);
}

function canReview(row: AuditTransaction): boolean {
  return row.import_token !== null && (row.status === "missing" || row.status === "possible_match");
}

function pageKey(page: AuditPage): string {
  const coverage = page.coverage;
  return `${coverage.simplefin_item_id}:${coverage.window_start_date}:${coverage.window_end_date}`;
}

function reviewRows(pages: AuditPage[]): ReviewRow[] {
  const rows = new Map<string, ReviewRow>();
  for (const page of pages) {
    const feeds = new Map(page.feeds.map((feed) => [feed.simplefin_account_id, feed]));
    for (const [index, row] of page.transactions.entries()) {
      const key =
        row.provider_transaction_id === null
          ? `${pageKey(page)}:${row.simplefin_account_id}:invalid:${index}`
          : identityKey(row);
      const feed = feeds.get(row.simplefin_account_id);
      const existing = rows.get(key);
      // An overlapping page must not make an ineligible identity importable again.
      if (existing === undefined || (canReview(existing) && !canReview(row)))
        rows.set(key, { ...row, key, feedName: feed?.name ?? "", retired: feed?.retired ?? false });
    }
  }
  return [...rows.values()].toSorted(
    (left, right) =>
      (right.date ?? "").localeCompare(left.date ?? "") || left.key.localeCompare(right.key),
  );
}

export function SimplefinHistoryAuditDrawer() {
  const params = useParams({ strict: false });
  const accountId = AccountIdSchema.parse(params.accountId);
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const fallback = bootstrap.accountDetailText;
  const close = useDialogClose("/accounts");
  const query = useQuery(historyAuditMetadataQueryOptions(accountId));
  const [pending, setPending] = useState(false);
  useBlocker({ shouldBlockFn: () => pending, enableBeforeUnload: pending });
  function requestClose() {
    if (!pending) close();
  }
  return (
    <Modal
      ariaLabelledby="history-audit-title"
      onClose={requestClose}
      open
      placement="drawer"
      panelClassName="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-container shadow-border-lg lg:rounded-2xl"
    >
      {query.data ? (
        <AuditReview
          key={accountId}
          metadata={query.data}
          onClose={requestClose}
          pending={pending}
          setPending={setPending}
        />
      ) : (
        <div className="space-y-4 p-6" aria-busy={query.isPending}>
          <DialogTitle id="history-audit-title" className="text-lg font-medium text-primary">
            {query.isPending ? fallback.loading : fallback.unavailable}
          </DialogTitle>
          {query.isPending ? (
            <Icon name="loader-circle" className="animate-spin text-secondary" />
          ) : (
            <Alert variant="error" live="alert">
              <p>
                {query.error instanceof HistoryAuditApiError && query.error.message
                  ? query.error.message
                  : fallback.unavailable}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void query.refetch();
                }}
              >
                {fallback.retry}
              </Button>
            </Alert>
          )}
          <Button variant="secondary" onClick={requestClose}>
            {fallback.close}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function AuditReview({
  metadata,
  onClose,
  pending,
  setPending,
}: {
  metadata: AuditMetadata;
  onClose: () => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
}) {
  const { account, text } = metadata;
  const queryClient = useQueryClient();
  const [periodDays, setPeriodDays] = useState(String(metadata.default_period_days));
  const [pages, setPages] = useState<AuditPage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState("attention");
  const [decisions, setDecisions] = useState<Partial<Record<string, AuditImportDecision>>>({});
  const [applyError, setApplyError] = useState<unknown>(null);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [reviewReset, setReviewReset] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [failedRequest, setFailedRequest] = useState<{
    body: AuditRequest;
    mode: RequestMode;
  } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );
  const rows = reviewRows(pages);
  const filtered = rows.filter(
    (row) =>
      filter === "all" ||
      (filter === "attention" ? ATTENTION.has(row.status) : row.status === filter),
  );
  const selected = rows.flatMap((row) => {
    const decision = decisions[row.key];
    return canReview(row) &&
      decision !== undefined &&
      decision.token === row.import_token &&
      (decision.entry_id === null ||
        row.possible_matches.some((candidate) => candidate.entry_id === decision.entry_id))
      ? [decision]
      : [];
  });
  const missing = rows.filter(
    (row) => row.status === "missing" && canReview(row) && decisions[row.key] === undefined,
  );
  const reviewBlocked =
    applyError instanceof HistoryAuditApiError &&
    ["invalid_import_token", "stale_import", "import_conflict", "mapping_conflict"].includes(
      applyError.code,
    );
  const applyErrorMessage =
    applyError instanceof HistoryAuditApiError && applyError.code === "invalid_import_token"
      ? text.import_expired
      : reviewBlocked
        ? text.import_stale
        : applyError instanceof HistoryAuditApiError &&
            applyError.status < 500 &&
            applyError.message
          ? applyError.message
          : text.import_failed;
  const providerErrors = pages.some((page) =>
    page.warnings.some((warning) => warning.code === "provider_errors"),
  );
  const partial = pages.some((page) => !page.coverage.page_complete);
  const stale = error instanceof HistoryAuditApiError && error.code === "stale_cursor";
  const rateLimited = error instanceof HistoryAuditApiError && error.status === 429;
  const errorMessage = stale
    ? text.stale
    : rateLimited
      ? text.rate_limited
      : error instanceof HistoryAuditApiError && error.status < 500 && error.message
        ? error.message
        : text.failed;

  async function load(body: AuditRequest, mode: RequestMode) {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setError(null);
    setFailedRequest(null);
    setAppliedCount(0);
    try {
      const page = await fetchHistoryAuditPage(account.id, body, controller.signal);
      if (controller.signal.aborted) return;
      // Refetched rows have new review tokens and candidates: never reuse their old choices.
      const refreshed = new Set(page.transactions.map(identityKey));
      if (mode === "retry") {
        const previous = pages.find((item) => pageKey(item) === pageKey(page));
        for (const row of previous?.transactions ?? []) refreshed.add(identityKey(row));
      }
      if (
        mode === "start" ||
        rows.some((row) => refreshed.has(identityKey(row)) && decisions[row.key] !== undefined)
      )
        setReviewReset(mode !== "start");
      setDecisions((previous) =>
        mode === "start"
          ? {}
          : Object.fromEntries(Object.entries(previous).filter(([key]) => !refreshed.has(key))),
      );
      setPages((previous) => {
        if (mode === "start") return [page];
        const existing = previous.some((item) => pageKey(item) === pageKey(page));
        return existing
          ? previous.map((item) => (pageKey(item) === pageKey(page) ? page : item))
          : [...previous, page];
      });
      // Retrying an earlier incomplete page must not rewind the scan.
      if (mode !== "retry") setNextCursor(page.next_cursor);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught);
        setFailedRequest({ body, mode });
      }
    } finally {
      if (!controller.signal.aborted) {
        inFlight.current = null;
        setPending(false);
      }
    }
  }

  async function applyReviewedChoices() {
    if (inFlight.current || selected.length === 0 || reviewBlocked) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setApplying(true);
    setApplyError(null);
    setAppliedCount(0);
    try {
      const result = await importHistoryAuditTransactions(account.id, selected, controller.signal);
      if (controller.signal.aborted) return;
      const recorded = new Map(
        result.transactions.map((transaction) => [identityKey(transaction), transaction]),
      );
      setPages((previous) =>
        previous.map((page) => ({
          ...page,
          transactions: page.transactions.map((row) => {
            const transaction = recorded.get(identityKey(row));
            return transaction
              ? {
                  ...row,
                  status: "recorded" as const,
                  entry_id: transaction.entry_id,
                  transaction_id: transaction.transaction_id,
                  import_token: null,
                  possible_matches: [],
                }
              : row;
          }),
        })),
      );
      setDecisions({});
      setReviewReset(false);
      setAppliedCount(result.transactions.length);
      // Ledger changes affect account activity, balances, charts, summaries and transactions.
      await queryClient.invalidateQueries({ queryKey: ["spa"] });
    } catch (caught) {
      if (!controller.signal.aborted) setApplyError(caught);
    } finally {
      if (!controller.signal.aborted) {
        inFlight.current = null;
        setApplying(false);
        setPending(false);
      }
    }
  }

  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-primary p-6">
        <div className="min-w-0 space-y-1">
          <DialogTitle id="history-audit-title" className="text-lg font-medium text-primary">
            {text.title}
          </DialogTitle>
          <p className="truncate text-sm text-secondary">{account.name}</p>
        </div>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {text.close}
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6" aria-busy={pending}>
        <Alert variant="info">
          <p>{text.description}</p>
        </Alert>
        <p className="text-sm text-secondary">{text.limits}</p>
        {pages.length === 0 ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void load({ period_days: Number(periodDays) }, "start");
            }}
          >
            <FormField
              id="audit-period-days"
              label={text.period_days}
              type="number"
              min={1}
              max={metadata.max_period_days}
              step={1}
              required
              value={periodDays}
              disabled={pending}
              onChange={(event) => {
                setPeriodDays(event.target.value);
              }}
            />
            <p className="text-xs text-secondary">{text.period_hint}</p>
            <Button
              type="submit"
              disabled={pending}
              iconProps={pending ? { name: "loader-circle", className: "animate-spin" } : undefined}
            >
              {pending ? text.loading : text.start}
            </Button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setPages([]);
                  setNextCursor(null);
                  setError(null);
                  setFailedRequest(null);
                  setFilter("attention");
                  setDecisions({});
                  setApplyError(null);
                  setAppliedCount(0);
                  setReviewReset(false);
                }}
              >
                {text.restart}
              </Button>
              <span className="text-xs text-secondary">{text.no_guarantee}</span>
            </div>
            {partial ? (
              <Alert variant="warning" live="status">
                <p>{text.partial}</p>
              </Alert>
            ) : null}
            {providerErrors ? (
              <Alert variant="warning" live="alert">
                <p>{text.provider_errors}</p>
              </Alert>
            ) : null}
            <DisclosureSection title={`${text.coverage} (${pages.length})`}>
              <ul className="divide-y divide-tertiary">
                {pages.map((page) => (
                  <li className="space-y-2 py-3 text-sm" key={pageKey(page)}>
                    <p className="font-medium text-primary">
                      {page.coverage.window_start_date} – {page.coverage.window_end_date}
                    </p>
                    <p className="text-secondary">
                      {page.feeds.map((feed) => feed.name).join(" · ")}
                    </p>
                    <p className={page.coverage.page_complete ? "text-secondary" : "text-warning"}>
                      {page.coverage.page_complete ? text.complete_page : text.partial_page}
                    </p>
                    {page.warnings.map((warning) => (
                      <p
                        className="text-warning"
                        key={`${warning.code}:${warning.simplefin_account_id ?? ""}`}
                      >
                        {text[`warning_${warning.code}`] ?? text.partial}
                        {warning.simplefin_account_id !== undefined
                          ? ` · ${page.feeds.find((feed) => feed.simplefin_account_id === warning.simplefin_account_id)?.name ?? ""}`
                          : ""}
                      </p>
                    ))}
                    {page.retry_cursor !== null ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending || stale}
                        onClick={() => {
                          void load({ cursor: page.retry_cursor ?? undefined }, "retry");
                        }}
                      >
                        {text.retry_page}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </DisclosureSection>
            <FormField
              as="select"
              id="audit-status"
              label={text.filter}
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            >
              <option value="attention">
                {text.attention} ({rows.filter((row) => ATTENTION.has(row.status)).length})
              </option>
              <option value="all">
                {text.all} ({rows.length})
              </option>
              {AUDIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {text[`status_${status}`]} ({rows.filter((row) => row.status === status).length})
                </option>
              ))}
            </FormField>
            <p className="text-xs text-secondary">{text.amount_hint}</p>
            <Alert variant="info">
              <p>{text.review_hint}</p>
            </Alert>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                disabled={pending || reviewBlocked || missing.length === 0}
                onClick={() => {
                  setDecisions((previous) => {
                    const updated = { ...previous };
                    for (const row of missing) {
                      if (row.import_token !== null)
                        updated[row.key] = { token: row.import_token, entry_id: null };
                    }
                    return updated;
                  });
                  setAppliedCount(0);
                }}
              >
                {text.select_missing} ({missing.length})
              </Button>
              <Button
                variant="secondary"
                disabled={pending || selected.length === 0}
                onClick={() => {
                  setDecisions({});
                }}
              >
                {text.clear_choices}
              </Button>
            </div>
            {reviewReset ? (
              <Alert variant="warning" live="status">
                <p>{text.review_reset}</p>
              </Alert>
            ) : null}
            {filtered.length === 0 ? (
              <output className="block py-4 text-sm text-secondary">{text.empty}</output>
            ) : (
              <ul className="space-y-3">
                {filtered.map((row) => (
                  <AuditTransactionRow
                    key={row.key}
                    row={row}
                    accountId={account.id}
                    text={text}
                    decision={decisions[row.key]}
                    disabled={pending || reviewBlocked}
                    onDecision={(entryId) => {
                      setDecisions((previous) => {
                        const updated = { ...previous };
                        if (entryId === undefined) delete updated[row.key];
                        else if (row.import_token !== null)
                          updated[row.key] = { token: row.import_token, entry_id: entryId };
                        return updated;
                      });
                      setAppliedCount(0);
                    }}
                  />
                ))}
              </ul>
            )}
            {nextCursor === null ? (
              <p className="text-sm text-secondary">{text.history_end}</p>
            ) : (
              <Button
                variant="secondary"
                disabled={pending || providerErrors || stale || rateLimited}
                onClick={() => {
                  void load({ cursor: nextCursor }, "next");
                }}
                iconProps={
                  pending && !applying
                    ? { name: "loader-circle", className: "animate-spin" }
                    : undefined
                }
              >
                {pending && !applying
                  ? text.loading
                  : pages.at(-1)?.coverage.has_more_connections === true
                    ? text.continue_period
                    : text.older}
              </Button>
            )}
          </>
        )}
        {error !== null ? (
          <Alert variant="error" live="alert">
            <p>{errorMessage}</p>
            {failedRequest && !stale ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  void load(failedRequest.body, failedRequest.mode);
                }}
              >
                {text.retry}
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </div>
      {pages.length > 0 ? (
        <footer className="shrink-0 space-y-2 border-t border-primary p-6">
          {applyError !== null ? (
            <Alert variant="error" live="alert">
              <p>{applyErrorMessage}</p>
            </Alert>
          ) : null}
          {appliedCount > 0 ? (
            <Alert variant="success" live="status">
              <p>{text.import_success.replace("%{count}", String(appliedCount))}</p>
            </Alert>
          ) : null}
          <Button
            disabled={pending || reviewBlocked || selected.length === 0}
            onClick={() => {
              void applyReviewedChoices();
            }}
            iconProps={applying ? { name: "loader-circle", className: "animate-spin" } : undefined}
          >
            {applying ? text.applying : `${text.apply_choices} (${selected.length})`}
          </Button>
          <p className="text-xs text-secondary">{text.apply_hint}</p>
        </footer>
      ) : null}
    </>
  );
}

function AuditTransactionRow({
  row,
  accountId,
  text,
  decision,
  disabled,
  onDecision,
}: {
  row: ReviewRow;
  accountId: string;
  text: Record<string, string>;
  decision: AuditImportDecision | undefined;
  disabled: boolean;
  onDecision: (entryId: string | null | undefined) => void;
}) {
  function href(transactionId: string): string {
    return `/accounts/${encodeURIComponent(accountId)}/transactions/${encodeURIComponent(transactionId)}`;
  }
  return (
    <li className="space-y-3 rounded-xl border border-primary p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 wrap-break-word font-medium text-primary">
          {row.name ?? text.unknown}
        </p>
        <span className="rounded-md bg-container-inset px-2 py-1 text-xs text-secondary">
          {text[`status_${row.status}`]}
        </span>
      </div>
      <p className="text-sm text-secondary">
        <span>{row.date ?? "—"}</span> ·{" "}
        <span className="privacy-sensitive tabular-nums">
          {row.currency} {row.amount ?? "—"}
        </span>
      </p>
      <p className="text-xs text-secondary">
        {row.feedName}
        {row.retired ? ` · ${text.retired}` : ""}
      </p>
      {row.transaction_id !== null ? (
        <a
          href={href(row.transaction_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-link hover:underline"
          title={text.new_tab}
        >
          {text.open_transaction}
        </a>
      ) : null}
      {row.possible_matches.length > 0 ? (
        <div className="space-y-2 border-t border-primary pt-3">
          <p className="text-xs font-medium text-secondary">{text.candidates}</p>
          <ul className="space-y-2">
            {row.possible_matches.map((candidate) => (
              <li key={candidate.entry_id}>
                <a
                  href={href(candidate.transaction_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md p-2 text-sm text-link hover:bg-container-hover focus-ring"
                  title={text.new_tab}
                >
                  <span className="block">{candidate.name}</span>
                  <span className="privacy-sensitive text-xs tabular-nums">
                    {candidate.date} · {candidate.currency} {candidate.amount}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canReview(row) ? (
        <FormField
          as="select"
          id={`audit-decision-${row.key}`}
          label={text.decision}
          value={
            decision === undefined
              ? ""
              : decision.entry_id === null
                ? "import"
                : `link:${decision.entry_id}`
          }
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onDecision(value === "" ? undefined : value === "import" ? null : value.slice(5));
          }}
        >
          <option value="">{text.skip}</option>
          <option value="import">{text.import_new}</option>
          {row.possible_matches.map((candidate) => (
            <option key={candidate.entry_id} value={`link:${candidate.entry_id}`}>
              {text.link_existing} · {candidate.name} · {candidate.date} · {candidate.currency}{" "}
              {candidate.amount}
            </option>
          ))}
        </FormField>
      ) : null}
    </li>
  );
}
