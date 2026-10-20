/* eslint-disable import/max-dependencies -- Valuation drawer composes session API, routing, and shared form/dialog controls. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";
import { useRef, useState, type SyntheticEvent } from "react";
import {
  deleteValuation,
  previewValuation,
  saveValuation,
  saveValuationNotes,
  ValuationApiError,
  valuationPageQueryOptions,
  type ValuationConfirmation,
  type ValuationPage,
} from "./api/valuations";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { parseReturnTo } from "./return-to";

export function validateValuationSearch(input: Record<string, unknown>): {
  account_id?: string;
  return_to?: string;
} {
  return {
    account_id: typeof input.account_id === "string" ? input.account_id : undefined,
    return_to:
      typeof input.return_to === "string" ? parseReturnTo(input.return_to, "/accounts") : undefined,
  };
}

export function ValuationDrawer() {
  const params = useParams({ strict: false });
  const router = useRouter();
  const search = useSearch({ strict: false, select: validateValuationSearch });
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const entryId = typeof params.valuationId === "string" ? params.valuationId : undefined;
  const accountId = typeof params.accountId === "string" ? params.accountId : search.account_id;
  const fallbackPath =
    typeof params.accountId === "string"
      ? `/accounts/${encodeURIComponent(params.accountId)}${window.location.search}`
      : "/accounts";
  const target = parseReturnTo(search.return_to, fallbackPath);
  const returnTo =
    new URL(target, window.location.origin).origin === window.location.origin
      ? target
      : fallbackPath;
  // Normal navigation reserializes search; preserve the opener's exact query encoding.
  const close = () => {
    router.history.push(returnTo);
  };
  const pending = useRef(false);
  const query = useQuery(valuationPageQueryOptions(entryId, accountId));
  const fallback = bootstrap.accountDetailText;

  return (
    <Modal
      ariaLabelledby="valuation-title"
      onClose={() => {
        if (!pending.current) close();
      }}
      open
      placement="drawer"
      panelClassName="flex h-full w-full max-w-xl flex-col overflow-hidden bg-container shadow-border-lg lg:rounded-2xl"
    >
      {query.data === undefined ? (
        <div className="space-y-4 p-6" aria-busy={query.isPending}>
          <DialogTitle id="valuation-title" className="text-lg font-medium text-primary">
            {query.isPending ? fallback.loading : fallback.unavailable}
          </DialogTitle>
          {query.isPending ? (
            <Icon name="loader-circle" className="animate-spin text-secondary" />
          ) : (
            <Alert live="alert" variant="error">
              <p>
                {query.error instanceof ValuationApiError && query.error.message
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
          <Button onClick={close} variant="secondary">
            {fallback.close}
          </Button>
        </div>
      ) : (
        <ValuationForm
          key={`${entryId ?? "new"}:${accountId ?? ""}`}
          data={query.data}
          onClose={close}
          onPendingChange={(value) => {
            pending.current = value;
          }}
        />
      )}
    </Modal>
  );
}

function ValuationForm({
  data,
  onClose,
  onPendingChange,
}: {
  data: ValuationPage;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const text = data.text;
  const queryClient = useQueryClient();
  const entryId = data.entry.id ?? undefined;
  const isNew = entryId === undefined;
  const [accountId, setAccountId] = useState<string>(
    data.account_id ?? data.accounts.at(0)?.id ?? "",
  );
  const [date, setDate] = useState(data.entry.date);
  const [amount, setAmount] = useState(data.entry.amount);
  const [notes, setNotes] = useState(data.entry.notes ?? "");
  const savedNotes = useRef(data.entry.notes ?? "");
  const [confirmation, setConfirmation] = useState<ValuationConfirmation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const account = data.accounts.find((item) => item.id === accountId);
  const canEdit = data.permissions.can_edit && account !== undefined;
  const input = { account_id: accountId, date, amount };

  function updatePending(value: boolean) {
    inFlight.current = value;
    setPending(value);
    onPendingChange(value);
  }

  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    updatePending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof ValuationApiError && caught.message
          ? caught.message
          : text.request_failed,
      );
    } finally {
      updatePending(false);
    }
  }

  async function finishMutation(closeAfterSave = true) {
    // Reconciliation and deletion affect balances, charts, activity, goals, and reports.
    await queryClient.invalidateQueries({ queryKey: ["spa"] });
    if (closeAfterSave) onClose();
  }

  function persistNotes() {
    if (entryId === undefined || !data.permissions.can_annotate || notes === savedNotes.current)
      return;
    void perform(async () => {
      await saveValuationNotes(entryId, notes);
      savedNotes.current = notes;
      await finishMutation(false);
    });
  }

  function preview(event: SyntheticEvent) {
    event.preventDefault();
    if (!canEdit) return;
    void perform(async () => {
      setConfirmation(await previewValuation(input, entryId));
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-primary p-6">
        <div className="min-w-0 space-y-1">
          <DialogTitle id="valuation-title" className="text-lg font-medium text-primary">
            {isNew
              ? text.title_new
              : data.entry.kind === "opening_anchor"
                ? text.opening_balance
                : data.entry.name}
          </DialogTitle>
          {!isNew ? (
            <>
              <p className="privacy-sensitive text-2xl font-medium text-primary">
                {data.entry.formatted_amount}{" "}
                <span className="text-lg text-secondary">{data.entry.currency}</span>
              </p>
              <p className="text-sm text-secondary">{data.entry.date_label}</p>
            </>
          ) : null}
        </div>
        <IconButton icon="x" label={text.cancel} disabled={pending} onClick={onClose} />
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-6" aria-busy={pending}>
        {error !== null ? (
          <Alert live="alert" variant="error">
            <p className="whitespace-pre-line">{error}</p>
          </Alert>
        ) : null}
        {confirmation !== null ? (
          <section className="space-y-4" aria-labelledby="valuation-confirmation-title">
            <h2 id="valuation-confirmation-title" className="text-lg font-medium text-primary">
              {isNew ? text.confirmation_title_create : text.confirmation_title_update}
            </h2>
            <p className="text-sm text-secondary">{confirmation.description}</p>
            {confirmation.investment ? (
              <dl className="space-y-3 rounded-lg border border-primary bg-container-inset p-4 text-sm">
                <div className="flex justify-between gap-4 font-medium text-primary">
                  <dt>{text.total_account_value}</dt>
                  <dd className="privacy-sensitive tabular-nums">{confirmation.total_value}</dd>
                </div>
                <div className="flex justify-between gap-4 text-secondary">
                  <dt>{text.holdings_value}</dt>
                  <dd className="privacy-sensitive tabular-nums">{confirmation.holdings_value}</dd>
                </div>
                <div className="flex justify-between gap-4 text-secondary">
                  <dt>{text.brokerage_cash}</dt>
                  <dd
                    className={`privacy-sensitive tabular-nums ${confirmation.brokerage_cash_negative ? "text-destructive" : "text-success"}`}
                  >
                    {confirmation.brokerage_cash}
                  </dd>
                </div>
              </dl>
            ) : null}
            <p className="text-sm text-secondary">{confirmation.notice}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setConfirmation(null);
                  setError(null);
                }}
              >
                {text.back}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={onClose}>
                {text.cancel}
              </Button>
              <Button
                disabled={pending || !canEdit}
                onClick={() => {
                  void perform(async () => {
                    await saveValuation(input, entryId);
                    await finishMutation();
                  });
                }}
              >
                {isNew ? text.confirm_create : text.confirm_update}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <section className="space-y-4" aria-labelledby="valuation-overview-title">
              <h2 id="valuation-overview-title" className="font-medium text-primary">
                {text.overview}
              </h2>
              {data.accounts.length === 0 ? (
                <Alert variant="info">
                  <p>{text.no_accounts}</p>
                </Alert>
              ) : null}
              <form className="space-y-4" onSubmit={preview}>
                <FormField
                  as="select"
                  id="valuation-account"
                  label={text.account}
                  value={accountId}
                  disabled={pending || !canEdit || !isNew || data.account_id !== null}
                  required
                  onChange={(event) => {
                    setAccountId(event.target.value);
                  }}
                >
                  {data.accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </FormField>
                <FormField
                  id="valuation-date"
                  label={text.date}
                  type="date"
                  value={date}
                  min={data.date_bounds.min}
                  max={data.date_bounds.max}
                  disabled={pending || !canEdit}
                  required
                  onChange={(event) => {
                    setDate(event.target.value);
                  }}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    containerClassName="col-span-2"
                    id="valuation-amount"
                    label={text.amount}
                    type="number"
                    step="any"
                    value={amount}
                    disabled={pending || !canEdit}
                    required
                    onChange={(event) => {
                      setAmount(event.target.value);
                    }}
                  />
                  <FormField
                    id="valuation-currency"
                    label={text.currency}
                    value={account?.currency ?? data.entry.currency}
                    readOnly
                  />
                </div>
                {canEdit ? (
                  <div className="flex justify-end">
                    <Button type="submit" disabled={pending}>
                      {text.preview}
                    </Button>
                  </div>
                ) : null}
              </form>
            </section>
            {!isNew ? (
              <details className="space-y-4" open>
                <summary className="cursor-pointer font-medium text-primary">
                  {text.details}
                </summary>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    persistNotes();
                  }}
                >
                  <FormField
                    as="textarea"
                    id="valuation-notes"
                    label={text.notes}
                    placeholder={text.notes_placeholder}
                    rows={5}
                    value={notes}
                    readOnly={!data.permissions.can_annotate}
                    disabled={pending}
                    onBlur={persistNotes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                    }}
                  />
                  {data.permissions.can_annotate ? (
                    <div className="flex justify-end">
                      <Button type="submit" disabled={pending}>
                        {text.save_notes}
                      </Button>
                    </div>
                  ) : null}
                </form>
              </details>
            ) : null}
            {!isNew && canEdit ? (
              <details className="space-y-4">
                <summary className="cursor-pointer font-medium text-primary">
                  {text.settings}
                </summary>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1 text-sm">
                    <h3 className="font-medium text-primary">{text.delete_title}</h3>
                    <p className="text-secondary">{text.delete_subtitle}</p>
                  </div>
                  <Button
                    variant="outline_destructive"
                    disabled={pending}
                    onClick={() => {
                      setDeleting(true);
                      setError(null);
                    }}
                  >
                    {text.delete}
                  </Button>
                </div>
              </details>
            ) : null}
          </>
        )}
      </div>
      {confirmation === null ? (
        <div className="flex justify-end border-t border-primary p-4">
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {text.cancel}
          </Button>
        </div>
      ) : null}
      {deleting ? (
        <Modal
          ariaLabelledby="valuation-delete-title"
          open
          layer="above"
          onClose={() => {
            if (!inFlight.current) setDeleting(false);
          }}
          panelClassName="w-full max-w-md space-y-4 rounded-2xl bg-container p-6 shadow-border-lg"
        >
          <DialogTitle id="valuation-delete-title" className="text-lg font-medium text-primary">
            {text.delete_confirm_title}
          </DialogTitle>
          <p className="text-sm text-secondary">{text.delete_confirm_body}</p>
          {error !== null ? (
            <Alert live="alert" variant="error">
              <p className="whitespace-pre-line">{error}</p>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setDeleting(false);
                setError(null);
              }}
            >
              {text.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !canEdit}
              onClick={() => {
                if (entryId === undefined) return;
                void perform(async () => {
                  await deleteValuation(entryId);
                  await finishMutation();
                });
              }}
            >
              {text.delete}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
