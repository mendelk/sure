// eslint-disable import/max-dependencies -- Statement vault composes the upload card, linked/unmatched tables, linking actions, and the statement detail page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState, type SyntheticEvent } from "react";
import {
  invalidateAccountQueries,
  mutateStatement,
  statementDetailQueryOptions,
  statementsIndexQueryOptions,
  updateStatementMetadata,
  type StatementDetail,
  type StatementRow,
  type StatementsIndex,
} from "./api/account-spa";
import { StatementIdSchema } from "./ids";
import { readCsrfToken } from "./api/transactions";
import { CategoryIcon, Icon } from "./icon";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Modal } from "./modal";

function noop(): void {
  // Ignored promise error
}
export const STATEMENTS_INDEX_PATH = "/account_statements.json";

function statementIcon(filename: string): string {
  if (filename.toLowerCase().endsWith(".pdf")) return "file-text";
  if (filename.toLowerCase().endsWith(".xlsx")) return "sheet";
  return "file-spreadsheet";
}

function StatementIcon({ filename }: { filename: string }) {
  return <CategoryIcon className="size-4 shrink-0" name={statementIcon(filename)} />;
}

function UnmatchedRow({ row, onError }: { row: StatementRow; onError: (message: string) => void }) {
  const queryClient = useQueryClient();
  const link = () => {
    mutateStatement(row.id, "link", { account_id: row.suggestion?.id ?? "" })
      .then(() => {
        void invalidateAccountQueries(queryClient);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "Link failed");
      });
  };
  const reject = () => {
    mutateStatement(row.id, "reject")
      .then(() => {
        void invalidateAccountQueries(queryClient);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "Reject failed");
      });
  };
  return (
    <tr
      className="border-b border-subdued last:border-b-0 hover:bg-surface-hover"
      id={`statement_${row.id}`}
    >
      <td className="px-4 py-3">
        <Link
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
          params={{ statementId: row.id }}
          to="/account_statements/$statementId"
        >
          <StatementIcon filename={row.filename} />
          <span className="truncate">{row.filename}</span>
        </Link>
        <p className="text-xs text-secondary">{row.size}</p>
      </td>
      <td className="px-4 py-3 text-sm text-secondary">{row.period}</td>
      <td className="px-4 py-3">
        {row.suggestion !== null ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-primary">{row.suggestion.name}</p>
            <p className="text-xs text-secondary">{row.suggestion.confidence} match</p>
          </div>
        ) : (
          <span className="text-sm text-secondary">No suggestion</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          {row.link_href !== null && row.suggestion !== null ? (
            <IconButton icon="link" label="Link suggestion" onClick={link} />
          ) : null}
          {row.suggestion !== null ? (
            <IconButton icon="x" label="Reject suggestion" onClick={reject} />
          ) : null}
          <Link
            aria-label="View"
            params={{ statementId: row.id }}
            to="/account_statements/$statementId"
          >
            <Icon name="eye" size="sm" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

function LinkedRow({ row }: { row: StatementRow }) {
  return (
    <tr
      className="border-b border-subdued last:border-b-0 hover:bg-surface-hover"
      id={`statement_${row.id}`}
    >
      <td className="px-4 py-3">
        <Link
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
          params={{ statementId: row.id }}
          to="/account_statements/$statementId"
        >
          <StatementIcon filename={row.filename} />
          <span className="truncate">{row.filename}</span>
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-secondary">{row.account}</td>
      <td className="px-4 py-3 text-sm text-secondary">{row.period}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <Link
            aria-label="View"
            params={{ statementId: row.id }}
            to="/account_statements/$statementId"
          >
            <Icon name="eye" size="sm" />
          </Link>
          {row.download_href !== null ? (
            <a aria-label="Download" href={row.download_href}>
              <Icon name="download" size="sm" />
            </a>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

type StatementsIndexUpload = StatementsIndex["upload"] & {
  storage_used: string;
};

function UploadCard({
  upload,
  onChanged,
}: {
  upload: StatementsIndexUpload;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const filesField = form.elements.namedItem("account_statement[files]");
    const files = filesField instanceof HTMLInputElement ? filesField.files : null;
    const accountField = form.elements.namedItem("account_statement[account_id]");
    const accountId = accountField instanceof HTMLSelectElement ? accountField.value : "";

    if (files === null || files.length === 0) {
      setError("Select at least one statement file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      for (const file of files) body.append("account_statement[files][]", file);
      if (accountId !== "") body.append("account_statement[account_id]", accountId);
      const response = await fetch(upload.href, {
        method: "POST",
        headers: { "X-CSRF-Token": readCsrfToken() },
        body,
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      onChanged();
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl bg-container p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Upload statements</p>
          <p className="text-xs text-secondary">
            Upload statements to the inbox, or choose an account to link immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-secondary">Storage used</p>
          <p className="text-sm font-medium text-primary">{upload.storage_used}</p>
        </div>
      </div>
      {error !== null ? (
        <Alert className="mb-3" live="alert" variant="error">
          {error}
        </Alert>
      ) : null}
      <form
        className="grid gap-3 lg:grid-cols-[1fr_16rem_auto] lg:items-end"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <FormField
          accept={upload.accept}
          id="statement-files"
          label="Statement files"
          multiple
          name="account_statement[files]"
          type="file"
        />
        <p className="-mt-1 text-xs text-secondary lg:col-start-1 lg:row-start-2">
          PDF, CSV, or XLSX. {upload.max_size_mb}MB max per file.
        </p>
        <FormField
          as="select"
          id="statement-account"
          label="Account"
          name="account_statement[account_id]"
        >
          <option value="">Leave unmatched</option>
          {upload.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </FormField>
        <div>
          <Button disabled={submitting} type="submit">
            {submitting ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const STATEMENTS_TEXT = {
  empty_unmatched: "The statement inbox is clear.",
  empty_linked: "No linked statements yet.",
  unmatched_title: "Unmatched inbox",
  linked_title: "Linked statements",
  file: "File",
  period: "Period",
  suggestion: "Suggestion",
  account: "Account",
  actions: "Actions",
};

function StatementTable({
  emptyLabel,
  heading,
  kind,
  rows,
  onError,
}: {
  heading: string;
  rows: StatementRow[];
  kind: "unmatched" | "linked";
  emptyLabel: string;
  onError: (message: string) => void;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-container shadow-border-xs">
      <div className="flex items-center gap-1.5 bg-container-inset px-4 py-2.5 text-xs font-medium uppercase text-secondary">
        <p>{heading}</p>
        <span className="text-subdued">&middot;</span>
        <p>{rows.length}</p>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm font-medium text-secondary">{emptyLabel}</p>
        ) : (
          <table aria-label={heading} className="w-full">
            <thead className="sticky top-0 z-10 bg-container text-xs font-medium uppercase text-secondary">
              <tr className="border-b border-tertiary">
                <th className="min-w-56 px-4 py-3 text-left">{STATEMENTS_TEXT.file}</th>
                {kind === "linked" ? (
                  <th className="min-w-44 px-4 py-3 text-left">{STATEMENTS_TEXT.account}</th>
                ) : null}
                <th className="min-w-44 px-4 py-3 text-left">{STATEMENTS_TEXT.period}</th>
                {kind === "unmatched" ? (
                  <th className="min-w-48 px-4 py-3 text-left">{STATEMENTS_TEXT.suggestion}</th>
                ) : null}
                <th className="min-w-24 px-4 py-3 text-right">{STATEMENTS_TEXT.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tertiary bg-container">
              {rows.map((row) =>
                kind === "unmatched" ? (
                  <UnmatchedRow key={row.id} onError={onError} row={row} />
                ) : (
                  <LinkedRow key={row.id} row={row} />
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function StatementsIndexPage() {
  const query = useQuery(statementsIndexQueryOptions(STATEMENTS_INDEX_PATH));
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const data = query.data;

  if (query.isError) {
    return (
      <section className="space-y-4">
        <Alert live="alert" variant="error">
          <p className="mb-3">Statement vault is unavailable.</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
            variant="secondary"
          >
            Try again
          </Button>
        </Alert>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {error !== null ? (
        <Alert live="alert" variant="error">
          {error}
        </Alert>
      ) : null}

      {data !== undefined ? (
        <UploadCard
          onChanged={() => {
            void invalidateAccountQueries(queryClient);
          }}
          upload={{ ...data.upload, storage_used: data.storage_used }}
        />
      ) : (
        <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />
      )}

      {data !== undefined ? (
        <>
          <StatementTable
            emptyLabel={STATEMENTS_TEXT.empty_unmatched}
            heading={STATEMENTS_TEXT.unmatched_title}
            kind="unmatched"
            onError={setError}
            rows={data.unmatched.items}
          />
          <StatementTable
            emptyLabel={STATEMENTS_TEXT.empty_linked}
            heading={STATEMENTS_TEXT.linked_title}
            kind="linked"
            onError={setError}
            rows={data.linked.items}
          />
        </>
      ) : null}
    </section>
  );
}

/* ---------- statement detail (route: /statements/$statementId) ---------- */

const STATEMENT_TEXT = {
  download: "Download",
  delete: "Delete",
  metadata_title: "Statement metadata",
  linking_title: "Account link",
  reconciliation_title: "Reconciliation",
  save: "Save statement",
  unlink: "Unlink",
  link_suggestion: "Link suggestion",
  reject: "Reject",
  no_suggestion: "No account suggestion yet.",
  unmatched_account: "Unmatched inbox",
  unknown: "Unknown",
  statement_amount: "Statement",
  ledger_amount: "Sure ledger",
  difference: "Difference",
  matched: "Matched",
  mismatched: "Mismatched",
  unavailable: "Not checked",
} as const;

function MetadataForm({ statement, onSaved }: { statement: StatementDetail; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metadata = statement.metadata;

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const get = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" && value !== "" ? value : null;
      };
      await updateStatementMetadata(statement.id, {
        institution_name_hint: get("account_statement[institution_name_hint]"),
        account_name_hint: get("account_statement[account_name_hint]"),
        account_last4_hint: get("account_statement[account_last4_hint]"),
        currency: get("account_statement[currency]"),
        period_start_on: get("account_statement[period_start_on]"),
        period_end_on: get("account_statement[period_end_on]"),
        opening_balance: get("account_statement[opening_balance]"),
        closing_balance: get("account_statement[closing_balance]"),
        account_id: get("account_statement[account_id]"),
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save statement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error !== null ? (
        <Alert className="mb-3" live="alert" variant="error">
          {error}
        </Alert>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            defaultValue={metadata.institution_name ?? ""}
            id="statement-institution-hint"
            label="Institution hint"
            name="account_statement[institution_name_hint]"
            type="text"
          />
          <FormField
            defaultValue={metadata.account_name ?? ""}
            id="statement-account-hint"
            label="Account name hint"
            name="account_statement[account_name_hint]"
            type="text"
          />
          <FormField
            defaultValue={metadata.account_last4 ?? ""}
            id="statement-last4-hint"
            label="Account last four"
            name="account_statement[account_last4_hint]"
            type="text"
          />
          <FormField
            as="select"
            defaultValue={metadata.currency}
            id="statement-currency"
            label="Currency"
            name="account_statement[currency]"
          >
            {(statement.accounts.length > 0 ? [] : []).concat([]).length === 0 ? null : null}
            {["USD", "EUR", "GBP", "CAD", "AUD"].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </FormField>
          <FormField
            defaultValue={metadata.period_start_on ?? ""}
            id="statement-period-start"
            label="Period start"
            name="account_statement[period_start_on]"
            type="date"
          />
          <FormField
            defaultValue={metadata.period_end_on ?? ""}
            id="statement-period-end"
            label="Period end"
            name="account_statement[period_end_on]"
            type="date"
          />
          <FormField
            defaultValue={metadata.opening_balance ?? ""}
            id="statement-opening-balance"
            label="Opening balance"
            name="account_statement[opening_balance]"
            step="0.01"
            type="number"
          />
          <FormField
            defaultValue={metadata.closing_balance ?? ""}
            id="statement-closing-balance"
            label="Closing balance"
            name="account_statement[closing_balance]"
            step="0.01"
            type="number"
          />
          <FormField
            as="select"
            defaultValue={statement.account?.id ?? ""}
            id="statement-account-select"
            label="Account"
            name="account_statement[account_id]"
          >
            <option value="">Leave unmatched</option>
            {statement.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </FormField>
        </div>
        <Button disabled={saving} type="submit">
          {saving ? "Saving…" : STATEMENT_TEXT.save}
        </Button>
      </form>
    </>
  );
}

function ReadonlyMetadata({ statement }: { statement: StatementDetail }) {
  const rows: [string, string][] = [
    ["Account", statement.account?.name ?? STATEMENT_TEXT.unmatched_account],
    ["Institution hint", statement.metadata.institution_name ?? STATEMENT_TEXT.unknown],
    ["Account name hint", statement.metadata.account_name ?? STATEMENT_TEXT.unknown],
    ["Account last four", statement.metadata.account_last4 ?? STATEMENT_TEXT.unknown],
    ["Currency", statement.metadata.currency],
    ["Period", statement.period],
  ];
  return (
    <dl className="grid gap-3 text-sm md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-secondary">{label}</dt>
          <dd className="text-primary">{value}</dd>
        </div>
      ))}
      <div>
        <dt className="text-xs text-secondary">Opening balance</dt>
        <dd className="privacy-sensitive text-primary">{statement.balances.opening}</dd>
      </div>
      <div>
        <dt className="text-xs text-secondary">Closing balance</dt>
        <dd className="privacy-sensitive text-primary">{statement.balances.closing}</dd>
      </div>
    </dl>
  );
}

export function StatementDetailPage() {
  const params = useParams({ strict: false });
  const rawStatementId = typeof params.statementId === "string" ? params.statementId : "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statementId = StatementIdSchema.parse(rawStatementId);
  const query = useQuery(
    statementDetailQueryOptions(`/account_statements/${encodeURIComponent(statementId)}.json`),
  );
  const statement = query.data;
  const [confirming, setConfirming] = useState(false);

  const invalidate = () => {
    void invalidateAccountQueries(queryClient);
  };

  if (query.isPending)
    return <output aria-busy="true" className="block h-64 animate-pulse rounded-xl bg-container" />;
  if (query.isError || statement === undefined) {
    return (
      <Alert live="alert" variant="error">
        <p className="mb-3">Statement is unavailable.</p>
        <Button
          onClick={() => {
            void query.refetch();
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </Alert>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-container p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatementIcon filename={statement.filename} />
              <h2 className="truncate text-lg font-medium text-primary">{statement.filename}</h2>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-secondary">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                  statement.status === "linked"
                    ? "bg-success/10 text-success"
                    : statement.status === "rejected"
                      ? "bg-warning/10 text-warning"
                      : "bg-container-inset text-secondary"
                }`}
              >
                {statement.status_label}
              </span>
              <span>{statement.size}</span>
              <span>{statement.content_type}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statement.download_href !== null ? (
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                href={statement.download_href}
              >
                <Icon name="download" size="sm" />
                {STATEMENT_TEXT.download}
              </a>
            ) : null}
            {statement.can_manage ? (
              <Button
                onClick={() => {
                  setConfirming(true);
                }}
                size="sm"
                variant="ghost"
              >
                <Icon name="trash-2" size="sm" />
                {STATEMENT_TEXT.delete}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-xl bg-container p-4">
          <h3 className="mb-3 text-sm font-medium text-primary">{STATEMENT_TEXT.metadata_title}</h3>
          {statement.can_manage ? (
            <MetadataForm onSaved={invalidate} statement={statement} />
          ) : (
            <ReadonlyMetadata statement={statement} />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-container p-4">
            <h3 className="mb-3 text-sm font-medium text-primary">
              {STATEMENT_TEXT.linking_title}
            </h3>
            {statement.account !== null ? (
              <>
                <p className="mb-3 text-sm text-secondary">Linked to {statement.account.name}.</p>
                {statement.can_manage ? (
                  <Button
                    onClick={() => {
                      mutateStatement(statement.id, "unlink").then(invalidate).catch(noop);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <Icon name="unlink" size="sm" />
                    {STATEMENT_TEXT.unlink}
                  </Button>
                ) : null}
              </>
            ) : statement.suggested_account !== null ? (
              <>
                <p className="mb-3 text-sm text-secondary">
                  Suggested account is {statement.suggested_account.name} (
                  {statement.suggested_account.confidence} confidence).
                </p>
                {statement.can_manage ? (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        mutateStatement(statement.id, "link", {
                          account_id: statement.suggested_account?.id ?? "",
                        })
                          .then(invalidate)
                          .catch(noop);
                      }}
                      size="sm"
                    >
                      <Icon name="link" size="sm" />
                      {STATEMENT_TEXT.link_suggestion}
                    </Button>
                    <Button
                      onClick={() => {
                        mutateStatement(statement.id, "reject").then(invalidate).catch(noop);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Icon name="x" size="sm" />
                      {STATEMENT_TEXT.reject}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-secondary">{STATEMENT_TEXT.no_suggestion}</p>
            )}
          </div>

          <div className="rounded-xl bg-container p-4">
            <h3 className="mb-3 text-sm font-medium text-primary">
              {STATEMENT_TEXT.reconciliation_title}
            </h3>
            {statement.reconciliation.length === 0 ? (
              <p className="text-sm text-secondary">{STATEMENT_TEXT.unavailable}</p>
            ) : (
              <div className="space-y-3">
                {statement.reconciliation.map((check) => (
                  <div
                    className="rounded-lg bg-container-inset p-3 shadow-border-xs"
                    key={check.label}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-primary">{check.label}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                          check.status === "matched"
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {check.status_label}
                      </span>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-secondary">
                      <div className="flex justify-between gap-3">
                        <dt>{STATEMENT_TEXT.statement_amount}</dt>
                        <dd className="privacy-sensitive">{check.amounts.statement}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{STATEMENT_TEXT.ledger_amount}</dt>
                        <dd className="privacy-sensitive">{check.amounts.ledger}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{STATEMENT_TEXT.difference}</dt>
                        <dd className="privacy-sensitive">{check.amounts.difference}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirming ? (
        <Modal
          ariaLabelledby="statement-delete-title"
          onClose={() => {
            setConfirming(false);
          }}
          open
          panelClassName="w-full max-w-md rounded-xl bg-container p-6 shadow-border-lg"
        >
          <h2 className="text-lg font-medium text-primary" id="statement-delete-title">
            {statement.confirm_delete.title}
          </h2>
          <p className="my-4 text-sm text-secondary">{statement.confirm_delete.body}</p>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setConfirming(false);
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                mutateStatement(statement.id, "destroy")
                  .then(() => {
                    invalidate();
                    void navigate({ to: "/account_statements" });
                  })
                  .catch(noop);
              }}
            >
              {statement.confirm_delete.confirmText}
            </Button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
