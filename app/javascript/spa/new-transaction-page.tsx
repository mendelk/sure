/* eslint-disable import/max-dependencies -- Route composes UI primitives with form and API modules. */
import { DialogTitle } from "@headlessui/react";
import { useForm } from "@tanstack/react-form";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as z from "zod/mini";
import type { SpaBootstrap } from "./bootstrap";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { useDismiss } from "./use-dismiss";
import {
  AccountIdSchema,
  TransactionIdSchema,
  type AccountId,
  type CategoryId,
  type MerchantId,
  type TagId,
  type TransactionId,
} from "./ids";
import {
  TransactionApiError,
  createTransaction,
  referenceDataQueryOptions,
  transactionDetailQueryOptions,
  type ReferenceOption,
  type SpaTransactionDetail,
  type TransactionCreateInput,
} from "./api/transactions";
import { CategorySelect, MerchantSelect, TagSelect } from "./transaction-detail-page";

export type NewTransactionSearch = {
  account_id?: AccountId;
  nature?: "inflow" | "outflow";
  duplicate_transaction_id?: TransactionId;
};

export function validateNewTransactionSearch(input: Record<string, unknown>): NewTransactionSearch {
  const result: NewTransactionSearch = {};
  const accountId = input.account_id;
  if (typeof accountId === "string" && accountId.trim().length > 0)
    result.account_id = AccountIdSchema.parse(accountId);
  const nature = input.nature;
  if (nature === "inflow" || nature === "outflow") result.nature = nature;
  const duplicateId = input.duplicate_transaction_id;
  if (duplicateId !== undefined && duplicateId !== null && duplicateId !== "")
    result.duplicate_transaction_id = z.pipe(z.uuid(), TransactionIdSchema).parse(duplicateId);
  return result;
}

export type NewTransactionFormValues = {
  account_id: AccountId | "";
  amount: string;
  category_id: CategoryId | "";
  date: string;
  currency: string;
  merchant_id: MerchantId | "";
  name: string;
  nature: "inflow" | "outflow";
  notes: string;
  tag_ids: TagId[];
};

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type CurrencyOption = SpaBootstrap["transactionCreation"]["currencies"][number];
type CreationReferences = {
  accounts: ReferenceOption<AccountId>[];
  categories: ReferenceOption<CategoryId>[];
  merchants: ReferenceOption<MerchantId>[];
  tags: ReferenceOption<TagId>[];
};

function newIdempotencyKey(): string {
  if (Reflect.has(crypto, "randomUUID")) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // UUID v4 version and RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function duplicateAmount(source: SpaTransactionDetail, currency: CurrencyOption): string {
  const precision = Math.max(0, Math.round(-Math.log10(Number(currency.step))));
  // Some currencies have five subunits per unit, rather than a power of ten.
  const scaled =
    (BigInt(source.amount_cents) * 10n ** BigInt(precision)) / BigInt(currency.minorUnitConversion);
  const digits = scaled.toString().padStart(precision + 1, "0");
  return precision === 0 ? digits : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
}

async function requestCurrency(code: string, signal: AbortSignal): Promise<CurrencyOption> {
  const response = await fetch(`/currencies/${encodeURIComponent(code)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new TransactionApiError("Currency unavailable", response.status);
  const payload: unknown = await response.json();
  const currency = z
    .object({
      iso_code: z.string(),
      name: z.string(),
      step: z.number(),
      minor_unit_conversion: z.number().check(z.positive()),
    })
    .parse(payload);
  return {
    code: currency.iso_code,
    name: currency.name,
    step: String(currency.step),
    minorUnitConversion: currency.minor_unit_conversion,
  };
}

function clearCreationSearch(previous: Record<string, unknown>) {
  const {
    account_id: _account,
    nature: _nature,
    duplicate_transaction_id: _duplicate,
    ...rest
  } = previous;
  return rest;
}

type TransactionCreationProps = {
  bootstrap: SpaBootstrap;
  defaultAccountId?: AccountId;
  defaultNature?: "inflow" | "outflow";
  onClose: () => void;
  references: CreationReferences;
  source?: SpaTransactionDetail;
};

function NewTransactionSeed({ source: sourceInput, ...props }: TransactionCreationProps) {
  const [source] = useState(sourceInput);
  const text = props.bootstrap.accountDetailText;
  const sourceCurrency = props.bootstrap.transactionCreation.currencies.find(
    (currency) => currency.code === source?.currency,
  );
  const currencyQuery = useQuery({
    queryKey: ["spa", "currency", source?.currency],
    queryFn:
      source !== undefined && sourceCurrency === undefined
        ? ({ signal }) => requestCurrency(source.currency, signal)
        : skipToken,
    staleTime: Infinity,
    retry: false,
  });
  const duplicateCurrency = sourceCurrency ?? currencyQuery.data;
  if (source !== undefined && currencyQuery.isError) {
    return (
      <Alert live="alert" title={text.creation_source_error} variant="error">
        <p className="mt-1">{text.creation_source_error_description}</p>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => {
              void currencyQuery.refetch();
            }}
            variant="secondary"
          >
            {text.retry}
          </Button>
          <Button onClick={props.onClose} variant="ghost">
            {text.close}
          </Button>
        </div>
      </Alert>
    );
  }
  if (source !== undefined && duplicateCurrency === undefined)
    return <output className="text-sm text-secondary">{text.creation_loading}</output>;
  return <NewTransactionForm {...props} duplicateCurrency={duplicateCurrency} source={source} />;
}

export function NewTransactionPage() {
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (context: { bootstrap: SpaBootstrap }) => context.bootstrap,
  });
  const search = useSearch({
    strict: false,
    select: (value: Record<string, unknown>) => validateNewTransactionSearch(value),
  });
  const contextAccount = useParams({
    strict: false,
    select: (value: { accountId?: string }) => value.accountId,
  });
  const accountId =
    contextAccount !== undefined ? AccountIdSchema.parse(contextAccount) : undefined;
  const duplicateId = search.duplicate_transaction_id;
  const navigate = useNavigate();
  const text = bootstrap.accountDetailText;
  const referenceQuery = useQuery(
    referenceDataQueryOptions(
      bootstrap.apiPaths.categories,
      bootstrap.apiPaths.merchants,
      bootstrap.apiPaths.tags,
      bootstrap.apiPaths.accounts,
    ),
  );
  const sourceQuery = useQuery(
    transactionDetailQueryOptions(bootstrap.apiPaths.transactions, duplicateId),
  );
  const source = duplicateId !== undefined ? sourceQuery.data : undefined;

  function close() {
    const contextAccountId = accountId ?? search.account_id;
    if (contextAccountId !== undefined) {
      void navigate({
        to: "/accounts/$accountId",
        params: { accountId: contextAccountId },
        search: (previous: Record<string, unknown>) => clearCreationSearch(previous),
        resetScroll: false,
      });
    } else {
      void navigate({
        to: "/transactions",
        search: (previous: Record<string, unknown>) => clearCreationSearch(previous),
        resetScroll: false,
      });
    }
  }

  const sourceFailed = duplicateId !== undefined && sourceQuery.isError;
  const referencesFailed = referenceQuery.isError && referenceQuery.data === undefined;
  const loading =
    referenceQuery.data === undefined || (duplicateId !== undefined && source === undefined);
  return (
    <Modal
      onClose={close}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <NewTransactionHeader onClose={close} />
        {referenceQuery.isError && referenceQuery.data !== undefined ? (
          <Alert live="alert" title={text.creation_reference_error} variant="warning">
            <Button
              className="mt-2"
              onClick={() => {
                void referenceQuery.refetch();
              }}
              size="sm"
              variant="secondary"
            >
              {text.retry}
            </Button>
          </Alert>
        ) : null}
        {sourceFailed || referencesFailed ? (
          <Alert
            live="alert"
            title={sourceFailed ? text.creation_source_error : text.creation_reference_error}
            variant="error"
          >
            {sourceFailed ? <p className="mt-1">{text.creation_source_error_description}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => {
                  if (sourceFailed) void sourceQuery.refetch();
                  else void referenceQuery.refetch();
                }}
                variant="secondary"
              >
                {text.retry}
              </Button>
              <Button onClick={close} variant="ghost">
                {text.close}
              </Button>
            </div>
          </Alert>
        ) : loading ? (
          <output className="text-sm text-secondary">{text.creation_loading}</output>
        ) : (
          <NewTransactionSeed
            bootstrap={bootstrap}
            defaultAccountId={search.account_id ?? accountId}
            defaultNature={search.nature}
            key={`${duplicateId ?? "new"}:${search.account_id ?? accountId ?? ""}:${search.nature ?? ""}`}
            onClose={close}
            references={referenceQuery.data}
            source={source}
          />
        )}
      </div>
    </Modal>
  );
}

function NewTransactionForm({
  bootstrap,
  defaultAccountId,
  defaultNature,
  duplicateCurrency,
  onClose,
  references,
  source,
}: TransactionCreationProps & { duplicateCurrency?: CurrencyOption }) {
  const { accounts: referenceAccounts, categories, merchants, tags } = references;
  const accounts =
    source !== undefined && !referenceAccounts.some((account) => account.id === source.account.id)
      ? [...referenceAccounts, { id: source.account.id, name: source.account.name }]
      : referenceAccounts;
  const queryClient = useQueryClient();
  const text = bootstrap.accountDetailText;
  const [idempotencyKey] = useState(newIdempotencyKey);
  const requestRef = useRef<AbortController | null>(null);
  const formElementRef = useRef<HTMLFormElement>(null);
  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  const [defaultValues] = useState<NewTransactionFormValues>(() => {
    const values: NewTransactionFormValues = {
      account_id: defaultAccountId ?? bootstrap.transactionCreation.defaultAccountId ?? "",
      amount: "",
      category_id: "",
      currency: bootstrap.transactionCreation.defaultCurrency,
      date: todayIso(),
      merchant_id: "",
      name: "",
      nature: defaultNature ?? "outflow",
      notes: "",
      tag_ids: [],
    };
    if (source !== undefined) {
      values.account_id = defaultAccountId ?? source.account.id;
      values.currency = source.currency;
      values.category_id = source.category?.id ?? "";
      values.merchant_id = source.merchant?.id ?? "";
      values.name = source.name;
      values.nature = defaultNature ?? (source.signed_amount_cents > 0 ? "inflow" : "outflow");
      values.notes = source.notes ?? "";
      values.tag_ids = source.tags.map((tag) => tag.id);
      if (duplicateCurrency !== undefined)
        values.amount = duplicateAmount(source, duplicateCurrency);
    } else {
      values.currency =
        bootstrap.transactionCreation.accountCurrencies[values.account_id] ??
        bootstrap.transactionCreation.defaultCurrency;
    }
    return values;
  });
  const currencies =
    duplicateCurrency !== undefined &&
    !bootstrap.transactionCreation.currencies.some(
      (currency) => currency.code === duplicateCurrency.code,
    )
      ? [...bootstrap.transactionCreation.currencies, duplicateCurrency]
      : bootstrap.transactionCreation.currencies;
  const create = useMutation({
    mutationFn: (input: TransactionCreateInput) => {
      requestRef.current = new AbortController();
      return createTransaction(bootstrap.railsPaths.transactions, input, requestRef.current.signal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["spa", "transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
      void queryClient.invalidateQueries({ queryKey: ["spa", "summary"] });
      onClose();
    },
  });
  const serverErrors =
    create.error instanceof TransactionApiError
      ? create.error.errors.length > 0
        ? create.error.errors
        : [create.error.message]
      : [];
  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      if (value.account_id === "" || create.isPending) return;
      const accountCurrency = bootstrap.transactionCreation.accountCurrencies[value.account_id];
      const rateValue =
        formElementRef.current === null
          ? null
          : new FormData(formElementRef.current).get("exchange_rate");
      const exchangeRate = typeof rateValue === "string" ? rateValue : "";
      if (value.currency !== accountCurrency && !positiveDecimal(exchangeRate)) return;
      create.mutate({
        account_id: value.account_id,
        amount: value.amount,
        currency: value.currency,
        category_id: value.category_id !== "" ? value.category_id : undefined,
        date: value.date,
        exchange_rate: value.currency !== accountCurrency ? exchangeRate : undefined,
        idempotency_key: idempotencyKey,
        merchant_id: value.merchant_id !== "" ? value.merchant_id : undefined,
        name: value.name.trim(),
        nature: value.nature,
        notes: value.notes.trim().length > 0 ? value.notes.trim() : undefined,
        tag_ids: value.tag_ids,
      });
    },
  });
  return (
    <>
      {create.isError ? (
        <Alert live="alert" title={text.creation_save_error} variant="error">
          {serverErrors.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-secondary">
              {serverErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <form
        className="flex grow flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        ref={formElementRef}
      >
        <form.Field name="nature">
          {(natureField) => (
            <div
              className="grid grid-cols-3 gap-1 rounded-xl bg-container-inset p-1"
              role="tablist"
              aria-label={text.creation_type_label}
            >
              {(
                [
                  ["outflow", text.creation_expense_tab],
                  ["inflow", text.creation_income_tab],
                ] as const
              ).map(([value, label]) => (
                <Button
                  aria-selected={natureField.state.value === value}
                  variant={natureField.state.value === value ? "secondary" : "ghost"}
                  key={value}
                  onClick={() => {
                    natureField.handleChange(value);
                  }}
                  role="tab"
                  type="button"
                >
                  {label}
                </Button>
              ))}
              <Button
                aria-selected={false}
                onClick={() => {
                  const url = new URL(bootstrap.railsPaths.newTransfer, window.location.origin);
                  if (form.state.values.account_id !== "")
                    url.searchParams.set("from_account_id", form.state.values.account_id);
                  window.location.assign(url.href);
                }}
                role="tab"
                variant="ghost"
              >
                {text.creation_transfer_tab}
              </Button>
            </div>
          )}
        </form.Field>
        <div className="space-y-2">
          <form.Field
            name="name"
            validators={{
              onSubmit: ({ value }) =>
                value.trim().length === 0 ? "Enter a description" : undefined,
            }}
          >
            {(field) => (
              <FormField
                autoComplete="off"
                error={field.state.meta.errors.join(" ")}
                id="new-txn-name"
                label="Description"
                onChange={(event) => {
                  field.handleChange(event.currentTarget.value);
                }}
                placeholder="Describe transaction"
                required
                type="text"
                value={field.state.value}
              />
            )}
          </form.Field>
          <form.Field
            name="account_id"
            validators={{
              onSubmit: ({ value }) =>
                !accounts.some((account) => account.id === value) ||
                !bootstrap.transactionCreation.accountCurrencies[value]
                  ? "Select an account"
                  : undefined,
            }}
          >
            {(field) => (
              <AccountSelect
                accounts={accounts}
                loading={false}
                onSelect={(id) => {
                  field.handleChange(id);
                }}
                selectedAccountId={field.state.value}
                error={field.state.meta.errors.join(" ")}
              />
            )}
          </form.Field>
          <form.Field name="currency">
            {(field) => (
              <FormField
                as="select"
                id="new-txn-currency"
                label={text.creation_currency}
                onChange={(event) => {
                  field.handleChange(event.currentTarget.value);
                }}
                required
                value={field.state.value}
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </FormField>
            )}
          </form.Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <form.Subscribe selector={(state) => state.values.currency}>
              {(currency) => (
                <form.Field
                  name="amount"
                  validators={{
                    onSubmit: ({ value }): string | undefined => {
                      if (value.trim().length === 0) return "Enter an amount";
                      if (!positiveDecimal(value)) return "Enter an amount greater than zero";
                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <FormField
                      error={field.state.meta.errors.join(" ")}
                      id="new-txn-amount"
                      inputMode="decimal"
                      label="Amount"
                      min={0}
                      onChange={(event) => {
                        field.handleChange(event.currentTarget.value);
                      }}
                      placeholder="0.00"
                      required
                      step={currencies.find((option) => option.code === currency)?.step ?? "any"}
                      type="number"
                      value={field.state.value}
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
            <form.Field name="date">
              {(field) => (
                <FormField
                  id="new-txn-date"
                  label="Date"
                  max={todayIso()}
                  min="1996-01-01"
                  onChange={(event) => {
                    field.handleChange(event.currentTarget.value);
                  }}
                  required
                  type="date"
                  value={field.state.value}
                />
              )}
            </form.Field>
          </div>
          <form.Subscribe
            selector={(state) => ({
              accountId: state.values.account_id,
              amount: state.values.amount,
              currency: state.values.currency,
              date: state.values.date,
              submitted: state.submissionAttempts > 0,
            })}
          >
            {(values) => (
              <ExchangeRateFields
                amount={values.amount}
                date={values.date}
                fromCurrency={values.currency}
                key={`${values.accountId}:${values.currency}:${values.date}`}
                path={bootstrap.railsPaths.exchangeRate}
                submitted={values.submitted}
                text={text}
                toCurrency={bootstrap.transactionCreation.accountCurrencies[values.accountId]}
              />
            )}
          </form.Subscribe>
          <form.Field name="category_id">
            {(field) => (
              <CategorySelect
                bootstrap={bootstrap}
                categories={categories}
                initialCategory={source?.category}
                onSelect={(id) => {
                  field.handleChange(id);
                }}
                selectedCategoryId={field.state.value}
              />
            )}
          </form.Field>
        </div>
        <details className="group" open={false}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium uppercase text-secondary">Details</span>
            <Icon
              className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
              name="chevron-down"
            />
          </summary>
          <div className="mt-2 space-y-2">
            <form.Field name="merchant_id">
              {(field) => (
                <MerchantSelect
                  bootstrap={bootstrap}
                  initialMerchant={source?.merchant}
                  merchants={merchants}
                  onSelect={(id) => {
                    field.handleChange(id);
                  }}
                  selectedMerchantId={field.state.value}
                />
              )}
            </form.Field>
            <form.Field name="tag_ids" mode="array">
              {(field) => (
                <TagSelect
                  bootstrap={bootstrap}
                  initialTags={source?.tags}
                  onSelect={(ids) => {
                    field.handleChange(ids);
                  }}
                  selectedTagIds={field.state.value}
                  tags={tags}
                />
              )}
            </form.Field>
            <form.Field name="notes">
              {(field) => (
                <FormField
                  as="textarea"
                  id="new-txn-notes"
                  label="Notes"
                  onChange={(event) => {
                    field.handleChange(event.currentTarget.value);
                  }}
                  placeholder="Enter a note"
                  rows={5}
                  value={field.state.value}
                />
              )}
            </form.Field>
          </div>
        </details>
        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button disabled={!canSubmit || create.isPending} type="submit">
                {create.isPending ? "Saving…" : "Create transaction"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </>
  );
}

function positiveDecimal(value: string): boolean {
  return (
    /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim()) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

function formatExchangeRate(rate: number): string {
  let formatted = rate.toFixed(14).replace(/(\.\d{2}\d*?)0+$/u, "$1");
  if (!formatted.includes(".")) formatted += ".00";
  else if (/\.\d$/u.test(formatted)) formatted += "0";
  return formatted;
}

async function requestExchangeRate(
  path: string,
  from: string,
  to: string,
  date: string,
  signal: AbortSignal,
): Promise<string> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("date", date);
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new TransactionApiError("Exchange rate unavailable", response.status);
  const payload: unknown = await response.json();
  const data = z.object({ rate: z.number().check(z.positive()) }).parse(payload);
  if (!Number.isFinite(data.rate)) throw new Error("Exchange rate unavailable");
  return formatExchangeRate(data.rate);
}

function ExchangeRateFields({
  amount,
  date,
  fromCurrency,
  path,
  submitted,
  text,
  toCurrency,
}: {
  amount: string;
  date: string;
  fromCurrency: string;
  path: string;
  submitted: boolean;
  text: Record<string, string>;
  toCurrency?: string;
}) {
  const [mode, setMode] = useState<"convert" | "calculate">("convert");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [manualRate, setManualRate] = useState<string>();
  const foreignCurrency =
    toCurrency !== undefined && toCurrency !== "" && fromCurrency !== toCurrency;
  const rateQuery = useQuery({
    queryKey: ["spa", "exchange-rate", path, fromCurrency, toCurrency, date],
    queryFn:
      toCurrency !== undefined && toCurrency !== "" && fromCurrency !== toCurrency
        ? ({ signal }) => requestExchangeRate(path, fromCurrency, toCurrency, date, signal)
        : skipToken,
    enabled: mode === "convert",
    retry: false,
    staleTime: Infinity,
  });
  const rate =
    mode === "calculate"
      ? positiveDecimal(amount) && positiveDecimal(destinationAmount)
        ? (Number(destinationAmount) / Number(amount)).toFixed(14)
        : ""
      : (manualRate ?? rateQuery.data ?? "");
  if (!foreignCurrency) return null;
  const converted =
    positiveDecimal(amount) && positiveDecimal(rate)
      ? `${(Number(amount) * Number(rate)).toFixed(2)} ${toCurrency}`
      : "—";
  return (
    <section className="space-y-2" aria-label={text.creation_exchange_rate}>
      <input name="exchange_rate" type="hidden" value={rate} />
      <p className="text-sm text-secondary">{text.creation_exchange_rate_help}</p>
      <div className="flex gap-2" role="tablist" aria-label={text.creation_exchange_rate}>
        {(
          [
            ["convert", text.creation_convert_tab],
            ["calculate", text.creation_calculate_rate_tab],
          ] as const
        ).map(([value, label]) => (
          <Button
            aria-selected={mode === value}
            key={value}
            onClick={() => {
              if (mode === value) return;
              setDestinationAmount("");
              setManualRate(undefined);
              setMode(value);
            }}
            role="tab"
            variant={mode === value ? "secondary" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "convert" && rateQuery.isPending ? (
        <output className="text-sm text-secondary">{text.creation_rate_loading}</output>
      ) : null}
      {mode === "convert" && rateQuery.isError ? (
        <Alert live="alert" title={text.creation_rate_error} variant="warning">
          <Button
            className="mt-2"
            onClick={() => {
              setManualRate(undefined);
              void rateQuery.refetch();
            }}
            size="sm"
            variant="secondary"
          >
            {text.retry}
          </Button>
        </Alert>
      ) : null}
      {mode === "convert" ? (
        <>
          <FormField
            error={submitted && !positiveDecimal(rate) ? text.creation_rate_required : undefined}
            id="new-txn-exchange-rate"
            inputMode="decimal"
            label={`${text.creation_exchange_rate} (${fromCurrency} → ${toCurrency})`}
            min="0.00000000000001"
            onChange={(event) => {
              setManualRate(event.currentTarget.value);
            }}
            placeholder="1.0"
            required
            step="0.00000000000001"
            type="number"
            value={rate}
          />
          <p className="text-sm text-secondary">
            {text.creation_destination_amount}: <output>{converted}</output>
          </p>
        </>
      ) : (
        <>
          <FormField
            error={
              submitted
                ? !positiveDecimal(destinationAmount)
                  ? text.creation_destination_required
                  : !positiveDecimal(rate)
                    ? text.creation_rate_required
                    : undefined
                : undefined
            }
            id="new-txn-destination-amount"
            inputMode="decimal"
            label={`${text.creation_destination_amount} (${toCurrency})`}
            min={0}
            onChange={(event) => {
              setDestinationAmount(event.currentTarget.value);
            }}
            placeholder="0.00"
            required
            step="0.00000001"
            type="number"
            value={destinationAmount}
          />
          <p className="text-sm text-secondary">
            {text.creation_exchange_rate}:{" "}
            <output>{positiveDecimal(rate) ? formatExchangeRate(Number(rate)) : "—"}</output>
          </p>
        </>
      )}
    </section>
  );
}

function NewTransactionHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <DialogTitle className="text-lg font-medium text-primary">New transaction</DialogTitle>
        <p className="mt-0.5 text-sm text-secondary">
          Record income or an expense on a manual account.
        </p>
      </div>
      <IconButton className="shrink-0" icon="x" label="Close" onClick={onClose} />
    </div>
  );
}

type AccountSelectProps = {
  accounts: ReferenceOption<AccountId>[];
  error?: string;
  loading: boolean;
  onSelect: (accountId: AccountId) => void;
  selectedAccountId: AccountId | "";
};

function AccountSelect({
  accounts,
  error,
  loading,
  onSelect,
  selectedAccountId,
}: AccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  const selected = accounts.find((account) => account.id === selectedAccountId);
  const filtered = accounts.filter((account) =>
    account.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /* eslint-disable react/no-unstable-nested-components -- FormField receives a render callback, not a component type. */
  return (
    <FormField
      control={({ className, ...controlProps }) => (
        <div className="relative" ref={containerRef}>
          <button
            {...controlProps}
            aria-expanded={isOpen}
            className={`${className} flex min-h-7 cursor-pointer items-center gap-2 pr-8 text-left`}
            onClick={() => {
              setIsOpen((value) => !value);
              setQuery("");
            }}
            type="button"
          >
            {selected ? (
              <span className="truncate text-sm text-primary">{selected.name}</span>
            ) : (
              <span className="text-sm text-secondary">
                {loading ? "Loading accounts…" : "Select an Account"}
              </span>
            )}
          </button>
          {isOpen ? (
            <div className="absolute inset-x-0 top-full z-50 mt-1.5 min-w-48 rounded-lg bg-container p-1.5 shadow-lg">
              <div className="relative mb-1">
                <input
                  autoComplete="off"
                  className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                  }}
                  placeholder="Search accounts"
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
                {filtered.map((account) => (
                  <button
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                      account.id === selectedAccountId ? "bg-container-inset" : ""
                    }`}
                    key={account.id}
                    onClick={() => {
                      onSelect(account.id);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    <span className="truncate text-sm text-primary">{account.name}</span>
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-secondary">No matching accounts.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      error={error}
      id="new-txn-account-trigger"
      label="Account"
      required
    />
  );
  /* eslint-enable react/no-unstable-nested-components */
}
