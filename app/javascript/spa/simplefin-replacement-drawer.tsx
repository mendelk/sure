/* eslint-disable import/max-dependencies -- Replacement drawer composes routing, review controls, and the provider API. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  applyReplacement,
  previewReplacement,
  replacementPickerQueryOptions,
  ReplacementApiError,
  type ReplacementApplyRequest,
  type ReplacementEntry,
  type ReplacementPicker,
  type ReplacementPreview,
} from "./api/simplefin-replacement";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import { AccountIdSchema } from "./ids";
import { Modal } from "./modal";
import { parseReturnTo, useDialogClose } from "./return-to";

export function validateReplacementSearch(input: Record<string, unknown>): {
  simplefin_account_id?: string;
  return_to: string;
} {
  return {
    simplefin_account_id:
      typeof input.simplefin_account_id === "string" ? input.simplefin_account_id : undefined,
    return_to: parseReturnTo(input.return_to, "/accounts"),
  };
}

const KEEP_SEPARATE = "__keep_separate";

function entryLabel(entry: ReplacementEntry, text: Record<string, string>): string {
  const flags = [
    entry.pending ? text.pending : text.posted,
    entry.split ? text.split : "",
    entry.transfer ? text.transfer : "",
  ].filter(Boolean);
  return `${entry.date} · ${entry.name} · ${entry.currency} ${entry.amount} · ${flags.join(" · ")}`;
}

export function SimplefinReplacementDrawer() {
  const params = useParams({ strict: false });
  const accountId = AccountIdSchema.parse(params.accountId);
  const search = useSearch({ strict: false, select: validateReplacementSearch });
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const close = useDialogClose("/accounts");
  const query = useQuery(replacementPickerQueryOptions(accountId));
  const [busy, setBusy] = useState(false);
  const fallback = bootstrap.accountDetailText;

  return (
    <Modal
      ariaLabelledby="provider-replacement-title"
      onClose={() => {
        if (!busy) close();
      }}
      open
      placement="drawer"
      panelClassName="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-container shadow-border-lg lg:rounded-2xl"
    >
      {query.data === undefined ? (
        <div className="space-y-4 p-6" aria-busy={query.isPending}>
          <DialogTitle id="provider-replacement-title" className="text-lg font-medium text-primary">
            {query.isPending ? fallback.loading : fallback.unavailable}
          </DialogTitle>
          {query.isPending ? (
            <Icon name="loader-circle" className="animate-spin text-secondary" />
          ) : (
            <Alert live="alert" variant="error">
              <p>
                {query.error instanceof ReplacementApiError && query.error.message
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
        <ReplacementForm
          key={`${accountId}:${search.simplefin_account_id ?? ""}`}
          picker={query.data}
          preselection={search.simplefin_account_id}
          onClose={close}
          onPendingChange={setBusy}
        />
      )}
    </Modal>
  );
}

function ReplacementForm({
  picker,
  preselection,
  onClose,
  onPendingChange,
}: {
  picker: ReplacementPicker;
  preselection?: string;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const text = picker.text;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() =>
    picker.candidates.some((candidate) => candidate.id === preselection)
      ? (preselection ?? "")
      : "",
  );
  const [step, setStep] = useState<"select" | "match" | "review">("select");
  const [preview, setPreview] = useState<ReplacementPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [acceptedBalanceDifference, setAcceptedBalanceDifference] = useState(false);
  const [reviewedMatches, setReviewedMatches] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const retryRequest = useRef<{ signature: string; body: ReplacementApplyRequest } | null>(null);
  const candidate = picker.candidates.find((item) => item.id === selected);
  const allDecided =
    preview !== null && preview.incoming_entries.every((entry) => Boolean(decisions[entry.id]));
  const matches =
    preview?.incoming_entries.flatMap((entry) => {
      const survivor = decisions[entry.id];
      return survivor && survivor !== KEEP_SEPARATE
        ? [{ incoming_id: entry.id, survivor_id: survivor }]
        : [];
    }) ?? [];
  const matchesSignature = JSON.stringify(matches);
  const reviewCurrent = reviewedMatches === matchesSignature;
  const balanceDifference = preview?.balance.discrepancy;
  const requiresBalanceAcceptance =
    balanceDifference !== null &&
    balanceDifference !== undefined &&
    Number(balanceDifference) !== 0;

  function updateDecisions(next: Record<string, string>) {
    setDecisions(next);
    setAcceptedBalanceDifference(false);
    setReviewedMatches(null);
  }

  function reportError(caught: unknown) {
    if (caught instanceof ReplacementApiError && caught.code === "stale_preview") setStale(true);
    setError(
      caught instanceof ReplacementApiError && caught.message
        ? caught.message
        : text.request_failed,
    );
  }
  function updatePending(value: boolean) {
    setPending(value);
    onPendingChange(value);
  }

  async function loadPreview(refresh = false, nextStep: "match" | "review" = "match") {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    updatePending(true);
    setError(null);
    setAcceptedBalanceDifference(false);
    setReviewedMatches(null);
    try {
      const result = await previewReplacement(
        picker.account.id,
        selected,
        refresh ? matches : undefined,
      );
      const nextDecisions = refresh
        ? Object.fromEntries(
            result.incoming_entries.flatMap((entry) => {
              const decision = decisions[entry.id];
              return decision &&
                (decision === KEEP_SEPARATE ||
                  result.canonical_entries.some((canonical) => canonical.id === decision))
                ? [[entry.id, decision]]
                : [];
            }),
          )
        : Object.fromEntries(
            result.suggested_matches
              .filter((suggestion) => suggestion.preselect === true)
              .map((suggestion) => [suggestion.incoming_id, suggestion.survivor_id]),
          );
      setPreview(result);
      setDecisions(nextDecisions);
      if (refresh) setReviewedMatches(matchesSignature);
      retryRequest.current = null;
      setStale(false);
      setStep(
        nextStep === "review" &&
          result.incoming_entries.every((entry) => Boolean(nextDecisions[entry.id]))
          ? "review"
          : "match",
      );
    } catch (caught) {
      reportError(caught);
    } finally {
      inFlight.current = false;
      updatePending(false);
    }
  }

  async function apply() {
    if (
      preview === null ||
      stale ||
      !allDecided ||
      !reviewCurrent ||
      (requiresBalanceAcceptance && !acceptedBalanceDifference) ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    updatePending(true);
    setError(null);
    const content = {
      simplefin_account_id: selected,
      fingerprint: preview.fingerprint,
      matches,
      accept_balance_difference: requiresBalanceAcceptance && acceptedBalanceDifference,
    };
    const signature = JSON.stringify(content);
    try {
      if (retryRequest.current?.signature !== signature) {
        const key = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) =>
          part.toString(16).padStart(8, "0"),
        ).join("");
        retryRequest.current = { signature, body: { ...content, idempotency_key: key } };
      }
      const result = await applyReplacement(picker.account.id, retryRequest.current.body);
      // Account, transaction, transfer, summary and provider caches all depend on the ledger mapping.
      await queryClient.invalidateQueries({ queryKey: ["spa"] });
      await navigate({
        to: "/accounts/$accountId",
        params: { accountId: result.account_id },
        search: { tab: "overview" },
        replace: true,
      });
    } catch (caught) {
      reportError(caught);
    } finally {
      inFlight.current = false;
      updatePending(false);
    }
  }

  return (
    <>
      <header className="space-y-2 border-b border-primary p-6">
        <DialogTitle id="provider-replacement-title" className="text-lg font-medium text-primary">
          {text.title}
        </DialogTitle>
        <p className="text-sm font-medium text-primary">{picker.account.name}</p>
        <p className="text-sm text-secondary">
          {step === "select"
            ? text.select_description
            : step === "match"
              ? text.match_description
              : text.review_description}
        </p>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-6" aria-busy={pending}>
        {error === null ? null : (
          <Alert live="alert" variant="error">
            <p>{error}</p>
          </Alert>
        )}
        {stale ? (
          <Alert live="status" variant="warning">
            <p>{text.stale_preview}</p>
            <Button
              disabled={pending}
              onClick={() => {
                void loadPreview(true, step === "review" ? "review" : "match");
              }}
              variant="secondary"
            >
              {text.refresh_preview}
            </Button>
          </Alert>
        ) : null}
        {step === "select" ? (
          <>
            {preselection !== undefined &&
            preselection !== "" &&
            !picker.candidates.some((item) => item.id === preselection) ? (
              <Alert variant="warning">{text.selection_unavailable}</Alert>
            ) : null}
            {picker.candidates.length === 0 ? (
              <Alert live="status">
                <p>{text.no_candidates}</p>
                <p className="mt-2">{text.no_candidates_help}</p>
              </Alert>
            ) : (
              <fieldset className="space-y-3" disabled={pending}>
                <legend className="mb-2 text-sm font-medium text-primary">
                  {text.select_account}
                </legend>
                {picker.candidates.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary p-4 hover:bg-container-hover"
                  >
                    <input
                      type="radio"
                      name="simplefin_account_id"
                      value={item.id}
                      checked={selected === item.id}
                      onChange={() => {
                        setSelected(item.id);
                        setError(null);
                        setStale(false);
                      }}
                      className="mt-1"
                    />
                    <span className="min-w-0 space-y-1 text-sm">
                      <span className="block font-medium text-primary">{item.name}</span>
                      <span className="block privacy-sensitive text-secondary">
                        {item.currency} {item.balance ?? text.balance_unavailable}
                        {item.account_type !== null && item.account_type !== ""
                          ? ` · ${item.account_type}`
                          : ""}
                      </span>
                      {item.linked_account ? (
                        <span className="block text-secondary">
                          {text.currently_linked_to.replace(
                            "%{account_name}",
                            item.linked_account.name,
                          )}
                        </span>
                      ) : (
                        <span className="block text-secondary">{text.unlinked}</span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        ) : preview === null ? null : (
          <>
            <section className="space-y-3" aria-label={text.summary}>
              <h3 className="font-medium text-primary">{text.summary}</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-secondary">{text.canonical_account}</dt>
                <dd className="text-primary">{preview.account.name}</dd>
                <dt className="text-secondary">{text.replacement_account}</dt>
                <dd className="text-primary">{preview.replacement.name}</dd>
                {preview.source_account ? (
                  <>
                    <dt className="text-secondary">{text.source_account}</dt>
                    <dd className="text-primary">{preview.source_account.name}</dd>
                  </>
                ) : null}
                <dt className="text-secondary">{text.incoming_count}</dt>
                <dd className="text-primary">{preview.summary.incoming_count}</dd>
                <dt className="text-secondary">{text.candidate_count}</dt>
                <dd className="text-primary">{preview.summary.candidate_count}</dd>
                <dt className="text-secondary">{text.current_balance}</dt>
                <dd className="privacy-sensitive text-primary">
                  {preview.balance.currency} {preview.balance.current}
                </dd>
                <dt className="text-secondary">{text.expected_balance}</dt>
                <dd className="privacy-sensitive text-primary">
                  {!reviewCurrent
                    ? text.balance_needs_refresh
                    : preview.balance.expected === null
                      ? text.not_comparable
                      : `${preview.balance.currency} ${preview.balance.expected}`}
                </dd>
                <dt className="text-secondary">{text.replacement_balance}</dt>
                <dd className="privacy-sensitive text-primary">
                  {preview.replacement.currency} {preview.balance.replacement}
                </dd>
                <dt className="text-secondary">{text.discrepancy}</dt>
                <dd className="privacy-sensitive text-primary">
                  {!reviewCurrent
                    ? text.balance_needs_refresh
                    : preview.balance.discrepancy === null
                      ? text.not_comparable
                      : `${preview.balance.currency} ${preview.balance.discrepancy}`}
                </dd>
              </dl>
              <Button
                disabled={pending}
                onClick={() => {
                  void loadPreview(true, step === "review" ? "review" : "match");
                }}
                variant="secondary"
              >
                {text.refresh_preview}
              </Button>
            </section>
            {preview.warnings.length === 0 ? null : (
              <Alert title={text.warnings} variant="warning">
                <ul className="list-inside list-disc space-y-1">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {preview.blockers.length === 0 ? null : (
              <Alert title={text.conflicts} variant="error">
                <ul className="list-inside list-disc space-y-1">
                  {preview.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
                <p className="mt-2">{text.conflicts_help}</p>
              </Alert>
            )}
            {step === "match" ? (
              <section className="space-y-4" aria-label={text.duplicate_choices}>
                <h3 className="font-medium text-primary">{text.duplicate_choices}</h3>
                <p className="text-sm text-secondary">{text.suggestions_unapproved}</p>
                {preview.incoming_entries.length === 0 ? (
                  <p className="text-sm text-secondary">{text.no_incoming_entries}</p>
                ) : (
                  <Button
                    disabled={pending || stale}
                    variant="secondary"
                    onClick={() => {
                      updateDecisions(
                        Object.fromEntries(
                          preview.incoming_entries.map((entry) => [
                            entry.id,
                            decisions[entry.id] || KEEP_SEPARATE,
                          ]),
                        ),
                      );
                    }}
                  >
                    {text.keep_remaining_separate}
                  </Button>
                )}
                {preview.incoming_entries.map((entry, index) => (
                  <div key={entry.id} className="space-y-2 rounded-lg border border-primary p-4">
                    <p className="privacy-sensitive text-sm text-primary">
                      {entryLabel(entry, text)}
                    </p>
                    <FormField
                      as="select"
                      id={`replacement-match-${index}`}
                      label={text.match_to}
                      disabled={pending || stale}
                      value={decisions[entry.id] ?? ""}
                      onChange={(event) => {
                        updateDecisions({ ...decisions, [entry.id]: event.target.value });
                      }}
                    >
                      <option value="">{text.choose_decision}</option>
                      <option value={KEEP_SEPARATE}>{text.keep_separate}</option>
                      {preview.canonical_entries
                        .filter(
                          (canonical) =>
                            canonical.entryable_type === "Transaction" &&
                            canonical.amount === entry.amount &&
                            canonical.currency === entry.currency &&
                            (entry.pending || !canonical.pending),
                        )
                        .map((canonical) => (
                          <option key={canonical.id} value={canonical.id}>
                            {entryLabel(canonical, text)}
                          </option>
                        ))}
                    </FormField>
                    {preview.suggested_matches
                      .filter((suggestion) => suggestion.incoming_id === entry.id)
                      .map((suggestion) => {
                        const survivor = preview.canonical_entries.find(
                          (canonical) => canonical.id === suggestion.survivor_id,
                        );
                        return survivor === undefined ? null : (
                          <div
                            key={suggestion.survivor_id}
                            className="space-y-1 text-xs text-secondary"
                          >
                            <p>
                              {text.suggested_match}: {entryLabel(survivor, text)}
                            </p>
                            <p>{suggestion.reason}</p>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending || stale}
                              onClick={() => {
                                updateDecisions({ ...decisions, [entry.id]: survivor.id });
                              }}
                            >
                              {text.choose_suggestion}
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </section>
            ) : (
              <section className="space-y-3" aria-label={text.final_review}>
                <h3 className="font-medium text-primary">{text.final_review}</h3>
                <p className="text-sm text-secondary">
                  {text.match_count.replace("%{count}", String(matches.length))}
                </p>
                <p className="text-sm text-secondary">
                  {text.separate_count.replace(
                    "%{count}",
                    String(preview.incoming_entries.length - matches.length),
                  )}
                </p>
                <ul className="space-y-3 text-sm">
                  {preview.incoming_entries.map((entry) => {
                    const survivor = preview.canonical_entries.find(
                      (canonical) => canonical.id === decisions[entry.id],
                    );
                    return (
                      <li key={entry.id} className="space-y-1 border-b border-primary pb-3">
                        <p className="privacy-sensitive text-primary">{entryLabel(entry, text)}</p>
                        <p className="privacy-sensitive text-secondary">
                          {survivor
                            ? `${text.merge_into}: ${entryLabel(survivor, text)}`
                            : text.keep_separate}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <Alert variant="warning">{text.apply_confirmation}</Alert>
                {requiresBalanceAcceptance ? (
                  <label className="flex items-start gap-3 text-sm text-primary">
                    <input
                      type="checkbox"
                      checked={acceptedBalanceDifference}
                      disabled={pending || stale || !reviewCurrent}
                      onChange={(event) => {
                        setAcceptedBalanceDifference(event.target.checked);
                      }}
                      className="mt-1"
                    />
                    <span>{text.accept_balance_difference}</span>
                  </label>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-primary p-6">
        <Button disabled={pending} onClick={onClose} variant="secondary">
          {text.cancel}
        </Button>
        {step !== "select" ? (
          <Button
            disabled={pending}
            variant="secondary"
            onClick={() => {
              setStep(step === "review" ? "match" : "select");
              setError(null);
            }}
          >
            {text.back}
          </Button>
        ) : null}
        {step === "select" ? (
          <Button
            disabled={pending || candidate === undefined}
            onClick={() => {
              void loadPreview();
            }}
          >
            {pending ? text.loading_preview : text.preview}
          </Button>
        ) : step === "match" ? (
          <Button
            disabled={pending || stale || !allDecided}
            onClick={() => {
              void loadPreview(true, "review");
            }}
          >
            {pending ? text.loading_preview : text.review}
          </Button>
        ) : (
          <Button
            disabled={
              pending ||
              stale ||
              !allDecided ||
              !reviewCurrent ||
              (requiresBalanceAcceptance && !acceptedBalanceDifference)
            }
            onClick={() => {
              void apply();
            }}
          >
            {pending ? text.applying : text.apply}
          </Button>
        )}
      </footer>
    </>
  );
}
