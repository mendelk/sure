/* eslint-disable import/max-dependencies -- Drawer composes account API, form options, form controls, and routing. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import * as z from "zod/mini";
import { accountDetailQueryOptions, type AccountDetail } from "./api/accounts";
import { apiFetch } from "./api/client";
import type { SpaBootstrap } from "./bootstrap";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FilledIcon } from "./components/filled-icon";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon, ICON_KEYS, type IconName } from "./icon";
import { AccountIdSchema } from "./ids";
import { Modal } from "./modal";
import { parseReturnTo } from "./return-to";

export type NewAccountSearch = {
  classification?: "asset" | "liability";
  return_to?: string;
};

export function validateNewAccountSearch(input: Record<string, unknown>): NewAccountSearch {
  const result: NewAccountSearch = {};
  if (input.classification === "asset" || input.classification === "liability")
    result.classification = input.classification;
  const returnTo = parseReturnTo(input.return_to, "");
  if (returnTo !== "") result.return_to = returnTo;
  return result;
}

export const ACCOUNTABLE_DRAWER_TYPES = [
  "depository",
  "investment",
  "vehicle",
  "credit_card",
  "crypto",
  "loan",
  "other_asset",
  "other_liability",
] as const;

export type AccountableDrawerType = (typeof ACCOUNTABLE_DRAWER_TYPES)[number];

const SUBTYPE_TYPES: Record<AccountableDrawerType, boolean> = {
  depository: true,
  investment: true,
  vehicle: false,
  credit_card: false,
  crypto: true,
  loan: true,
  other_asset: false,
  other_liability: false,
};

function isDrawerType(value: string): value is AccountableDrawerType {
  return (ACCOUNTABLE_DRAWER_TYPES as readonly string[]).includes(value);
}

type OptionItem = {
  value: string;
  label: string;
  short_label?: string | null;
  group?: string | null;
};

type FormOptions = {
  account_types: {
    value: string;
    label: string;
    classification: string;
    icon: string;
    color: string;
  }[];
  subtypes: Record<string, OptionItem[]>;
  tax_treatments: { value: string; label: string }[];
  loan_rate_types: { value: string; label: string }[];
  loan_insurance_rate_types: { value: string; label: string }[];
  mileage_units: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  default_currency: string | null;
};

const FormOptionsSchema = z.object({
  account_types: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      classification: z.string(),
      icon: z.string(),
      color: z.string(),
    }),
  ),
  subtypes: z.record(
    z.string(),
    z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        short_label: z.optional(z.nullable(z.string())),
        group: z.optional(z.nullable(z.string())),
      }),
    ),
  ),
  tax_treatments: z.array(z.object({ value: z.string(), label: z.string() })),
  loan_rate_types: z.optional(z.array(z.object({ value: z.string(), label: z.string() }))),
  loan_insurance_rate_types: z.optional(
    z.array(z.object({ value: z.string(), label: z.string() })),
  ),
  mileage_units: z.array(z.object({ value: z.string(), label: z.string() })),
  currencies: z.array(z.object({ value: z.string(), label: z.string() })),
  default_currency: z.nullable(z.string()),
});

export function accountFormOptionsQueryOptions(endpoint: string, currency?: string) {
  return {
    queryKey: ["spa", "account-form-options", currency ?? ""] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<FormOptions> => {
      const url =
        currency !== undefined && currency !== ""
          ? `${endpoint}?currency=${encodeURIComponent(currency)}`
          : endpoint;
      const response = await apiFetch(url, {
        signal,
      });
      if (!response.ok) throw new Error(`Account options request failed (${response.status})`);
      const payload: unknown = await response.json();
      const parsed = FormOptionsSchema.parse(payload);
      return {
        ...parsed,
        loan_rate_types: parsed.loan_rate_types ?? [],
        loan_insurance_rate_types: parsed.loan_insurance_rate_types ?? [],
      };
    },
    staleTime: 300_000,
  };
}

export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    if ("message" in payload && typeof payload.message === "string" && payload.message.length > 0)
      return payload.message;
    if ("errors" in payload && Array.isArray(payload.errors)) {
      const first = payload.errors.find(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
      if (first !== undefined) return first;
    }
  }
  return fallback;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function num(value: number | null | undefined): string {
  return value !== undefined && value !== null ? String(value) : "";
}

function str(value: string | null | undefined): string {
  return value ?? "";
}

function groupedOptions(options: OptionItem[]): { group: string; items: OptionItem[] }[] | null {
  const groups = [
    ...new Set(
      options.map((o) => o.group).filter((g): g is string => typeof g === "string" && g.length > 0),
    ),
  ];
  if (groups.length === 0) return null;
  return groups.map((group) => ({
    group,
    items: options.filter((o) => o.group === group),
  }));
}

function SubtypeSelect({
  id,
  label,
  prompt,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionItem[];
}) {
  const groups = groupedOptions(options);
  return (
    <FormField
      as="select"
      id={id}
      label={label}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      value={value}
    >
      <option value="">{prompt}</option>
      {groups === null
        ? options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        : groups.map(({ group, items }) => (
            <optgroup key={group} label={group}>
              {items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
    </FormField>
  );
}

/* ---------- edit drawer ---------- */

export function AccountableEditDrawer() {
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const navigate = useNavigate();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });

  const accountQuery = useQuery(accountDetailQueryOptions(accountId, { page: 1, tab: "overview" }));
  const account = accountQuery.data;
  const chrome = bootstrap.accountDetailText;

  function close() {
    void navigate({
      to: "/accounts/$accountId",
      params: { accountId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "overview" }),
      resetScroll: false,
    });
  }

  return (
    <Modal
      onClose={close}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              {account === undefined
                ? chrome.accountable_title_edit
                : `${chrome.accountable_title_edit} ${account.name}`}
            </DialogTitle>
            {account === undefined ? null : (
              <p className="mt-0.5 text-sm text-secondary">
                {account.text.accountable_subtitle_edit}
              </p>
            )}
          </div>
          <IconButton
            className="shrink-0"
            icon="x"
            label={chrome.accountable_close}
            onClick={close}
          />
        </div>

        {accountQuery.isPending ? (
          <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />
        ) : null}

        {accountQuery.isError ? (
          <Alert live="alert" title={chrome.unavailable} variant="error">
            <p>{chrome.unavailable}</p>
          </Alert>
        ) : null}

        {account !== undefined ? <AccountableEditForm account={account} onClose={close} /> : null}
      </div>
    </Modal>
  );
}

function AccountableEditForm({
  account,
  onClose,
}: {
  account: AccountDetail;
  onClose: () => void;
}) {
  if (!isDrawerType(account.account_type)) return <UnsupportedTypeNotice account={account} />;
  return <SupportedEditForm account={account} onClose={onClose} type={account.account_type} />;
}

function UnsupportedTypeNotice({ account }: { account: AccountDetail }) {
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const text = { ...bootstrap.accountDetailText, ...account.text };
  const nativeEdit = account.actions.find((a) => a.key === "edit" || a.key === "complete_setup");
  return (
    <Alert live="status" title={text.accountable_provider_title} variant="warning">
      <p>{text.accountable_provider_description}</p>
      {nativeEdit === undefined ? null : (
        <p className="mt-2">
          <a className="underline" href={nativeEdit.href}>
            {nativeEdit.label}
          </a>
        </p>
      )}
    </Alert>
  );
}

function SupportedEditForm({
  account,
  onClose,
  type,
}: {
  account: AccountDetail;
  onClose: () => void;
  type: AccountableDrawerType;
}) {
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const text = { ...bootstrap.accountDetailText, ...account.text };
  const linked = account.linked ?? false;
  const accountable = account.accountable ?? null;

  const optionsQuery = useQuery(
    accountFormOptionsQueryOptions(bootstrap.apiPaths.accountFormOptions, account.currency),
  );

  const [name, setName] = useState(account.name);
  const initBalance = account.balance;
  const initMake = accountable?.make;
  const initModel = accountable?.model;
  const initYear = accountable?.year;
  const initMileageValue = accountable?.mileage_value;
  const initAvailCredit = accountable?.available_credit;
  const initMinPayment = accountable?.minimum_payment;
  const initApr = accountable?.apr;
  const initAnnualFee = accountable?.annual_fee;
  const [balance, setBalance] = useState(num(initBalance));
  const [currency, setCurrency] = useState(account.currency);
  const [subtype, setSubtype] = useState(str(account.subtype ?? accountable?.subtype));
  const [make, setMake] = useState(str(typeof initMake === "string" ? initMake : null));
  const [model, setModel] = useState(str(typeof initModel === "string" ? initModel : null));
  const [year, setYear] = useState(num(typeof initYear === "number" ? initYear : null));
  const [mileageValue, setMileageValue] = useState(
    num(typeof initMileageValue === "number" ? initMileageValue : null),
  );
  const [mileageUnit, setMileageUnit] = useState(str(accountable?.mileage_unit) || "mi");
  const [availableCredit, setAvailableCredit] = useState(
    num(typeof initAvailCredit === "number" ? initAvailCredit : null),
  );
  const [minimumPayment, setMinimumPayment] = useState(
    num(typeof initMinPayment === "number" ? initMinPayment : null),
  );
  const [apr, setApr] = useState(num(typeof initApr === "number" ? initApr : null));
  const [annualFee, setAnnualFee] = useState(
    num(typeof initAnnualFee === "number" ? initAnnualFee : null),
  );
  const [expirationDate, setExpirationDate] = useState(str(accountable?.expiration_date));
  const [paymentDueDay, setPaymentDueDay] = useState(num(accountable?.payment_due_day));
  const [minimumPaymentOnly, setMinimumPaymentOnly] = useState(
    accountable?.minimum_payment_only ?? false,
  );
  const [taxTreatment, setTaxTreatment] = useState(str(accountable?.tax_treatment));
  const [institutionName, setInstitutionName] = useState(str(account.institution_name));
  const [institutionDomain, setInstitutionDomain] = useState(str(account.institution_domain));
  const [notes, setNotes] = useState(str(account.notes));
  const [excludeFromReports, setExcludeFromReports] = useState(
    account.exclude_from_reports ?? false,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        currency,
        institution_name: institutionName.trim(),
        institution_domain: institutionDomain.trim(),
        notes: notes.trim(),
        exclude_from_reports: excludeFromReports,
      };
      if (!linked && balance.trim().length > 0) payload.balance = balance.trim();
      if (subtype.trim().length > 0) payload.subtype = subtype;
      const nested: Record<string, unknown> = {};
      if (type === "vehicle") {
        if (make.trim().length > 0) nested.make = make.trim();
        if (model.trim().length > 0) nested.model = model.trim();
        if (year.trim().length > 0) nested.year = Number(year);
        if (mileageValue.trim().length > 0) nested.mileage_value = Number(mileageValue);
        nested.mileage_unit = mileageUnit;
      }
      if (type === "credit_card") {
        if (availableCredit.trim().length > 0) nested.available_credit = availableCredit.trim();
        if (minimumPayment.trim().length > 0) nested.minimum_payment = minimumPayment.trim();
        if (apr.trim().length > 0) nested.apr = apr.trim();
        if (annualFee.trim().length > 0) nested.annual_fee = annualFee.trim();
        if (expirationDate.trim().length > 0) nested.expiration_date = expirationDate;
        nested.payment_due_day = paymentDueDay.trim().length > 0 ? Number(paymentDueDay) : null;
        nested.minimum_payment_only = minimumPaymentOnly;
      }
      if (type === "crypto" && taxTreatment.trim().length > 0) nested.tax_treatment = taxTreatment;
      if (Object.keys(nested).length > 0) payload.accountable = nested;

      const response = await apiFetch(
        `${bootstrap.apiPaths.accounts}/${encodeURIComponent(account.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ account: payload }),
        },
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(data, text.accountable_save_error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : text.accountable_save_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const subtypeOptions = optionsQuery.data?.subtypes[type] ?? [];
  const taxOptions = optionsQuery.data?.tax_treatments ?? [];
  const taxValue = taxTreatment === "" ? (taxOptions[0]?.value ?? "") : taxTreatment;

  return (
    <>
      {submitError !== null ? (
        <Alert live="alert" title={submitError} variant="error">
          <p>{submitError}</p>
        </Alert>
      ) : null}
      {optionsQuery.isError ? (
        <Alert live="status" title={text.accountable_options_error} variant="warning">
          <p>{text.accountable_options_error}</p>
        </Alert>
      ) : null}

      <form
        className="flex grow flex-col justify-between gap-6"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="space-y-4">
          <FormField
            id="acct-name"
            label={text.accountable_name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder={text.accountable_name_placeholder}
            required
            type="text"
            value={name}
          />
          {linked ? null : (
            <FormField
              id="acct-balance"
              label={text.accountable_balance}
              onChange={(e) => {
                setBalance(e.target.value);
              }}
              required
              step="0.01"
              type="number"
              value={balance}
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              as="select"
              id="acct-currency"
              label={text.accountable_currency}
              onChange={(e) => {
                setCurrency(e.target.value);
              }}
              value={currency}
            >
              {(optionsQuery.data?.currencies ?? []).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </FormField>
            {SUBTYPE_TYPES[type] ? (
              <SubtypeSelect
                id="acct-subtype"
                label={text.accountable_subtype}
                prompt={text.accountable_subtype_prompt}
                value={subtype}
                onChange={setSubtype}
                options={subtypeOptions}
              />
            ) : null}
          </div>

          {type === "vehicle" ? (
            <>
              <div className="flex items-center gap-2">
                <FormField
                  id="acct-make"
                  label={text.accountable_vehicle_make}
                  onChange={(e) => {
                    setMake(e.target.value);
                  }}
                  placeholder={text.accountable_vehicle_make_placeholder}
                  type="text"
                  value={make}
                />
                <FormField
                  id="acct-model"
                  label={text.accountable_vehicle_model}
                  onChange={(e) => {
                    setModel(e.target.value);
                  }}
                  placeholder={text.accountable_vehicle_model_placeholder}
                  type="text"
                  value={model}
                />
              </div>
              <div className="flex items-center gap-2">
                <FormField
                  id="acct-year"
                  label={text.accountable_vehicle_year}
                  max={new Date().getFullYear() + 1}
                  min={1900}
                  onChange={(e) => {
                    setYear(e.target.value);
                  }}
                  placeholder={text.accountable_vehicle_year_placeholder}
                  type="number"
                  value={year}
                />
                <FormField
                  id="acct-mileage"
                  label={text.accountable_mileage}
                  min={0}
                  onChange={(e) => {
                    setMileageValue(e.target.value);
                  }}
                  placeholder={text.accountable_mileage_placeholder}
                  type="number"
                  value={mileageValue}
                />
                <FormField
                  as="select"
                  id="acct-mileage-unit"
                  label={text.accountable_mileage_unit}
                  onChange={(e) => {
                    setMileageUnit(e.target.value);
                  }}
                  value={mileageUnit}
                >
                  {(optionsQuery.data?.mileage_units ?? []).map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </FormField>
              </div>
            </>
          ) : null}

          {type === "credit_card" ? (
            <>
              <FormField
                id="acct-available-credit"
                label={text.accountable_credit_available_credit}
                min={0}
                onChange={(e) => {
                  setAvailableCredit(e.target.value);
                }}
                placeholder={text.accountable_credit_available_credit_placeholder}
                step="0.01"
                type="number"
                value={availableCredit}
              />
              <FormField
                id="acct-payment-due-day"
                label={text.accountable_credit_payment_due_day}
                min={1}
                max={31}
                step={1}
                type="number"
                value={paymentDueDay}
                onChange={(e) => {
                  setPaymentDueDay(e.target.value);
                }}
              />
              <p className="text-xs text-secondary">
                {text.accountable_credit_payment_due_day_hint}
              </p>
              <label className="flex items-center gap-2 text-sm text-primary">
                <input
                  checked={minimumPaymentOnly}
                  className="checkbox checkbox--light"
                  onChange={(e) => {
                    setMinimumPaymentOnly(e.target.checked);
                  }}
                  type="checkbox"
                />
                <span>{text.accountable_credit_minimum_payment_only}</span>
              </label>
              <p className="text-xs text-secondary">
                {text.accountable_credit_minimum_payment_only_hint}
              </p>
              <div className="flex items-center gap-2">
                <FormField
                  id="acct-minimum-payment"
                  label={text.accountable_credit_minimum_payment}
                  onChange={(e) => {
                    setMinimumPayment(e.target.value);
                  }}
                  placeholder={text.accountable_credit_minimum_payment_placeholder}
                  step="0.01"
                  type="number"
                  value={minimumPayment}
                />
                <FormField
                  id="acct-apr"
                  label={text.accountable_credit_apr}
                  min={0}
                  onChange={(e) => {
                    setApr(e.target.value);
                  }}
                  placeholder={text.accountable_credit_apr_placeholder}
                  step="0.01"
                  type="number"
                  value={apr}
                />
              </div>
              <div className="flex items-center gap-2">
                <FormField
                  id="acct-expiration"
                  label={text.accountable_credit_expiration_date}
                  onChange={(e) => {
                    setExpirationDate(e.target.value);
                  }}
                  type="date"
                  value={expirationDate}
                />
                <FormField
                  id="acct-annual-fee"
                  label={text.accountable_credit_annual_fee}
                  min={0}
                  onChange={(e) => {
                    setAnnualFee(e.target.value);
                  }}
                  placeholder={text.accountable_credit_annual_fee_placeholder}
                  step="0.01"
                  type="number"
                  value={annualFee}
                />
              </div>
            </>
          ) : null}

          {type === "crypto" ? (
            <FormField
              as="select"
              id="acct-tax-treatment"
              label={text.accountable_crypto_tax_treatment}
              description={text.accountable_crypto_tax_treatment_hint}
              onChange={(e) => {
                setTaxTreatment(e.target.value);
              }}
              value={taxValue}
            >
              {taxOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormField>
          ) : null}

          <details className="group" open={false}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-surface px-3 py-2 focus-ring [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-medium uppercase text-secondary">
                {text.accountable_additional_details}
              </span>
              <Icon
                className="text-secondary transition-transform duration-150 motion-safe:group-open:rotate-180"
                name="chevron-down"
              />
            </summary>
            <div className="mt-2 space-y-3">
              <FormField
                id="acct-institution-name"
                label={text.accountable_institution_name}
                onChange={(e) => {
                  setInstitutionName(e.target.value);
                }}
                placeholder={text.accountable_institution_name_placeholder}
                type="text"
                value={institutionName}
              />
              <FormField
                id="acct-institution-domain"
                label={text.accountable_institution_domain}
                onChange={(e) => {
                  setInstitutionDomain(e.target.value);
                }}
                placeholder={text.accountable_institution_domain_placeholder}
                type="text"
                value={institutionDomain}
              />
              <FormField
                as="textarea"
                id="acct-notes"
                label={text.accountable_notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                placeholder={text.accountable_notes_placeholder}
                rows={4}
                value={notes}
              />
              <label className="flex items-center gap-2 text-sm text-primary">
                <input
                  checked={excludeFromReports}
                  className="checkbox checkbox--light"
                  onChange={(e) => {
                    setExcludeFromReports(e.target.checked);
                  }}
                  type="checkbox"
                />
                <span>{text.accountable_exclude_from_reports}</span>
              </label>
            </div>
          </details>
        </div>

        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            {text.accountable_cancel}
          </Button>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? text.accountable_saving : text.accountable_save}
          </Button>
        </div>
      </form>
    </>
  );
}

/* ---------- new drawers ---------- */

// Match the ERB add-account order, including the specialized property wizard.
const PICKER_ORDER = [
  "depository",
  "investment",
  "crypto",
  "property",
  "vehicle",
  "credit_card",
  "loan",
  "other_asset",
  "other_liability",
] as const;
function isIconName(value: string): value is IconName {
  return (ICON_KEYS as readonly string[]).includes(value);
}

export function AccountableTypePickerDrawer() {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/transactions", resetScroll: false });
  };
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateNewAccountSearch(input),
  });
  const labels = bootstrap.accountDetailText;
  const optionsQuery = useQuery(
    accountFormOptionsQueryOptions(bootstrap.apiPaths.accountFormOptions),
  );
  type AccountTypeOption = {
    value: string;
    label: string;
    classification: string;
    icon: string;
    color: string;
  };
  const optionByValue: Record<string, AccountTypeOption | undefined> = {};
  for (const option of optionsQuery.data?.account_types ?? []) optionByValue[option.value] = option;
  const rows = PICKER_ORDER.map((value) => optionByValue[value]).filter(
    (t): t is AccountTypeOption =>
      t !== undefined &&
      (search.classification === undefined || t.classification === search.classification),
  );
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const focusRow = (index: number) => {
    const count = rows.length + (search.return_to === undefined ? 1 : 0);
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    linkRefs.current[next]?.focus();
  };
  const onPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = linkRefs.current.findIndex((link) => link === document.activeElement);
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key === "j" ||
      event.key === "J"
    ) {
      event.preventDefault();
      focusRow(index + 1);
    } else if (
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.key === "k" ||
      event.key === "K"
    ) {
      event.preventDefault();
      focusRow(index < 0 ? -1 : index - 1);
    }
  };
  const passthrough = search.return_to === undefined ? {} : { return_to: search.return_to };
  const pickLabel = (keys: string[], fallback: string): string => {
    for (const key of keys) {
      const value = labels[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return fallback;
  };
  const importLabel = pickLabel(
    ["accountable_import_accounts", "accountable_method_import"],
    "Import accounts",
  );
  const selectLabel = pickLabel(["accountable_picker_select"], "Select");
  const navigateLabel = pickLabel(["accountable_picker_navigate"], "Navigate");
  const closeLabel = pickLabel(["accountable_picker_close", "accountable_close"], "Close");
  const setRowRef = (index: number) => (el: HTMLAnchorElement | null) => {
    linkRefs.current[index] = el;
  };

  return (
    <Modal
      onClose={goBack}
      onKeyDown={onPickerKeyDown}
      open
      panelClassName="relative flex max-h-full w-full flex-col overflow-y-auto rounded-xl bg-container py-4 shadow-border-xs lg:max-w-[550px]"
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-tertiary px-4 pb-4 md:border-transparent">
          <DialogTitle className="text-base font-normal text-primary">
            {pickLabel(["accountable_type_label", "accountable_title_new"], "New account")}
          </DialogTitle>
          <IconButton
            className="shrink-0"
            icon="x"
            label={labels.accountable_close}
            onClick={goBack}
          />
        </div>

        <div className="p-2">
          {optionsQuery.isPending ? (
            <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-surface" />
          ) : null}
          {optionsQuery.isError ? (
            <Alert live="alert" title={labels.accountable_options_error} variant="error">
              <p>{labels.accountable_options_error}</p>
            </Alert>
          ) : null}

          <ul>
            {rows.map((t, index) => {
              const destination =
                t.value === "property"
                  ? { to: "/properties/new" as const }
                  : {
                      to: "/accounts/new/$accountType" as const,
                      params: { accountType: t.value },
                    };

              return (
                <li key={t.value}>
                  <Link
                    {...destination}
                    search={passthrough}
                    ref={setRowRef(index)}
                    className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-primary hover:bg-surface-hover focus:bg-surface-hover"
                  >
                    <FilledIcon color={t.color} icon={isIconName(t.icon) ? t.icon : "shapes"} />
                    <span className="min-w-0 grow text-sm">{t.label}</span>
                    <Icon
                      name="chevron-right"
                      size="sm"
                      className="ml-auto shrink-0 text-subdued transition-colors group-hover:text-secondary"
                    />
                  </Link>
                </li>
              );
            })}
            {search.return_to === undefined ? (
              <li>
                <a
                  href={bootstrap.railsPaths.newImport}
                  ref={setRowRef(rows.length)}
                  className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-primary hover:bg-surface-hover focus:bg-surface-hover"
                >
                  <FilledIcon color="var(--color-warning)" icon="download" />
                  <span className="min-w-0 grow text-sm">{importLabel}</span>
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="hidden justify-between px-4 pt-4 text-sm text-secondary md:flex">
          <div className="flex space-x-5">
            <div className="flex items-center space-x-2">
              <span>{selectLabel}</span>
              <kbd className="flex size-5 shrink-0 grow-0 items-center justify-center rounded-md bg-surface p-1">
                <Icon name="corner-down-left" size="sm" />
              </kbd>
            </div>
            <div className="flex items-center space-x-2">
              <span>{navigateLabel}</span>
              <kbd className="flex size-5 shrink-0 grow-0 items-center justify-center rounded-md bg-surface p-1">
                <Icon name="arrow-up" size="sm" />
              </kbd>
              <kbd className="flex size-5 shrink-0 grow-0 items-center justify-center rounded-md bg-surface p-1">
                <Icon name="arrow-down" size="sm" />
              </kbd>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={goBack} type="button">
              {closeLabel}
            </button>
            <kbd className="flex h-5 w-8 shrink-0 grow-0 items-center justify-center rounded-md bg-surface p-1 text-xs">
              ESC
            </kbd>
          </div>
        </div>
      </div>
    </Modal>
  );
}

type LinkOptionProvider = {
  key: string;
  name: string;
  new_account_path: string;
};

type LinkOptions = {
  account_type: string;
  manual_path: string;
  manual_label: string;
  providers: LinkOptionProvider[];
};

const LinkOptionsSchema = z.object({
  account_type: z.string(),
  manual_path: z.string(),
  manual_label: z.string(),
  providers: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      new_account_path: z.string(),
    }),
  ),
});

function linkOptionsQueryOptions(accountType: string, returnTo?: string) {
  const params = new URLSearchParams({ account_type: accountType });
  if (returnTo !== undefined && returnTo !== "") params.set("return_to", returnTo);
  return {
    queryKey: ["spa", "account-link-options", accountType, returnTo ?? ""] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<LinkOptions> => {
      const response = await apiFetch(`/api/v1/account_link_options?${params.toString()}`, {
        signal,
      });
      if (response.status === 422) throw new Error("unsupported");
      if (!response.ok) throw new Error(`Link options request failed (${response.status})`);
      const payload: unknown = await response.json();
      return LinkOptionsSchema.parse(payload);
    },
    staleTime: 300_000,
  };
}

export function AccountableNewDrawer() {
  const params = useParams({ strict: false });
  const rawType = typeof params.accountType === "string" ? params.accountType : "";
  const navigate = useNavigate();
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateNewAccountSearch(input),
  });
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/transactions", resetScroll: false });
  };
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const labels = bootstrap.accountDetailText;

  useEffect(() => {
    if (rawType === "property")
      void navigate({ to: "/properties/new", search: passthroughSearch(search), replace: true });
  }, [navigate, rawType, search]);

  if (rawType === "property") return null;

  if (!isDrawerType(rawType)) {
    return (
      <Modal
        onClose={goBack}
        open
        panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
        placement="drawer"
      >
        <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
          <Alert live="alert" title={labels.accountable_options_error} variant="error">
            <p>{labels.accountable_options_error}</p>
          </Alert>
          <div className="mt-auto flex justify-end gap-2 pt-4">
            <Button onClick={goBack} type="button" variant="ghost">
              {labels.accountable_cancel}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }
  return <AccountableMethodDrawer accountType={rawType} goBack={goBack} />;
}

function passthroughSearch(search: NewAccountSearch): Record<string, string> {
  return search.return_to === undefined ? {} : { return_to: search.return_to };
}

function AccountableMethodDrawer({
  accountType,
  goBack,
}: {
  accountType: AccountableDrawerType;
  goBack: () => void;
}) {
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateNewAccountSearch(input),
  });
  const navigate = useNavigate();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const labels = bootstrap.accountDetailText;
  const [manualOpen, setManualOpen] = useState(false);
  const linkQuery = useQuery(linkOptionsQueryOptions(accountType, search.return_to));

  const backSearch =
    search.classification === undefined && search.return_to === undefined
      ? {}
      : {
          ...(search.classification === undefined ? {} : { classification: search.classification }),
          ...(search.return_to === undefined ? {} : { return_to: search.return_to }),
        };
  const text = (key: string, fallback: string): string => {
    const value = labels[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  const methodTitle = text("accountable_method_title", "How would you like to add it?");
  const backLabel = text("property_back", "Back");
  const linkTemplate = text("accountable_method_link", "Link with %{provider}");
  const providerDescription = text("accountable_provider_description", "");

  const manualLabel = linkQuery.data?.manual_label ?? labels.accountable_method_manual;
  const methodRefs = useRef<(HTMLElement | null)[]>([]);
  const focusMethod = (index: number) => {
    const count = methodRefs.current.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    methodRefs.current[next]?.focus();
  };
  const onMethodKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key === "j" ||
      event.key === "J"
    ) {
      event.preventDefault();
      focusMethod(index + 1);
    } else if (
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.key === "k" ||
      event.key === "K"
    ) {
      event.preventDefault();
      focusMethod(index - 1);
    }
  };
  const setMethodRef = (index: number) => (el: HTMLElement | null) => {
    methodRefs.current[index] = el;
  };
  const showManual = manualOpen || linkQuery.isError;

  if (showManual) {
    return (
      <SupportedNewForm
        accountType={accountType}
        goBack={goBack}
        onBack={() => {
          setManualOpen(false);
        }}
      />
    );
  }

  return (
    <Modal
      onClose={goBack}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">{methodTitle}</DialogTitle>
          </div>
          <IconButton
            className="shrink-0"
            icon="x"
            label={labels.accountable_close}
            onClick={goBack}
          />
        </div>
        <div className="text-sm">
          <Link
            to="/accounts/new"
            search={backSearch}
            className="inline-flex items-center gap-1 text-secondary underline"
          >
            <Icon name="arrow-left" size="sm" />
            {backLabel}
          </Link>
        </div>
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              ref={setMethodRef(0)}
              onKeyDown={(event) => {
                onMethodKeyDown(event, 0);
              }}
              onClick={() => {
                setManualOpen(true);
              }}
              className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-center text-primary hover:bg-surface-hover focus:bg-surface-hover"
            >
              <span
                className="flex size-8 shrink-0 grow-0 items-center justify-center rounded-lg bg-alpha-black-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]"
                aria-hidden="true"
              >
                <Icon name="keyboard" size="sm" />
              </span>
              <span className="flex min-w-0 grow items-center gap-2 text-sm font-medium">
                {manualLabel}
              </span>
              <Icon
                name="chevron-right"
                size="sm"
                className="ml-auto shrink-0 text-subdued transition-colors group-hover:text-secondary"
              />
            </button>
          </li>
          {(linkQuery.data?.providers ?? []).map((provider, providerIndex) => (
            <li key={provider.key}>
              <a
                href={provider.new_account_path}
                ref={setMethodRef(providerIndex + 1) as (el: HTMLAnchorElement | null) => void}
                onKeyDown={(event) => {
                  onMethodKeyDown(event, providerIndex + 1);
                }}
                className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-center text-primary hover:bg-surface-hover focus:bg-surface-hover"
              >
                <span
                  className="flex size-8 shrink-0 grow-0 items-center justify-center rounded-lg bg-alpha-black-50 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]"
                  aria-hidden="true"
                >
                  <Icon name="link-2" size="sm" />
                </span>
                <span className="flex min-w-0 grow items-center gap-2 text-sm font-medium">
                  {linkTemplate.replace("%{provider}", provider.name)}
                </span>
                <Icon
                  name="chevron-right"
                  size="sm"
                  className="ml-auto shrink-0 text-subdued transition-colors group-hover:text-secondary"
                />
              </a>
            </li>
          ))}
        </ul>
        {providerDescription === "" ? null : (
          <p className="text-sm text-secondary">{providerDescription}</p>
        )}
        <div className="mt-auto flex justify-start pt-4">
          <Button
            onClick={() => {
              void navigate({ to: "/accounts/new", search: backSearch });
            }}
            type="button"
            variant="ghost"
          >
            {backLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SupportedNewForm({
  accountType,
  goBack,
  onBack,
}: {
  accountType: AccountableDrawerType;
  goBack: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const search = useSearch({
    strict: false,
    select: (input: Record<string, unknown>) => validateNewAccountSearch(input),
  });
  const labels = bootstrap.accountDetailText;

  const optionsQuery = useQuery(
    accountFormOptionsQueryOptions(bootstrap.apiPaths.accountFormOptions),
  );
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState(bootstrap.transactionCreation.defaultCurrency);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayIso());
  const [subtype, setSubtype] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [mileageValue, setMileageValue] = useState("");
  const [mileageUnit, setMileageUnit] = useState("mi");
  const [availableCredit, setAvailableCredit] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [apr, setApr] = useState("");
  const [annualFee, setAnnualFee] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("");
  const [minimumPaymentOnly, setMinimumPaymentOnly] = useState(false);
  const [taxTreatment, setTaxTreatment] = useState("");
  const [loanInitialBalance, setLoanInitialBalance] = useState("");
  const [loanInterestRate, setLoanInterestRate] = useState("");
  const [loanRateType, setLoanRateType] = useState("fixed");
  const [loanDownPayment, setLoanDownPayment] = useState("");
  const [loanStartDate, setLoanStartDate] = useState(todayIso());
  const [loanTermMonths, setLoanTermMonths] = useState("");
  const [loanInsuranceRate, setLoanInsuranceRate] = useState("");
  const [loanInsuranceRateType, setLoanInsuranceRateType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const nested: Record<string, unknown> = {};
      if (SUBTYPE_TYPES[accountType] && subtype.trim().length > 0) nested.subtype = subtype;
      if (accountType === "vehicle") {
        if (make.trim().length > 0) nested.make = make.trim();
        if (model.trim().length > 0) nested.model = model.trim();
        if (year.trim().length > 0) nested.year = Number(year);
        if (mileageValue.trim().length > 0) nested.mileage_value = Number(mileageValue);
        nested.mileage_unit = mileageUnit;
      }
      if (accountType === "credit_card") {
        if (availableCredit.trim().length > 0) nested.available_credit = availableCredit.trim();
        if (minimumPayment.trim().length > 0) nested.minimum_payment = minimumPayment.trim();
        if (apr.trim().length > 0) nested.apr = apr.trim();
        if (annualFee.trim().length > 0) nested.annual_fee = annualFee.trim();
        if (expirationDate.trim().length > 0) nested.expiration_date = expirationDate;
        nested.payment_due_day = paymentDueDay.trim().length > 0 ? Number(paymentDueDay) : null;
        nested.minimum_payment_only = minimumPaymentOnly;
      }
      if (accountType === "crypto" && taxTreatment.trim().length > 0)
        nested.tax_treatment = taxTreatment;
      if (accountType === "loan") {
        if (loanInitialBalance.trim().length > 0)
          nested.initial_balance = loanInitialBalance.trim();
        if (loanInterestRate.trim().length > 0) nested.interest_rate = loanInterestRate.trim();
        if (loanRateType.trim().length > 0) nested.rate_type = loanRateType.trim();
        if (loanDownPayment.trim().length > 0) nested.down_payment = loanDownPayment.trim();
        if (loanStartDate.trim().length > 0) nested.start_date = loanStartDate;
        if (loanTermMonths.trim().length > 0) nested.term_months = Number(loanTermMonths);
        if (loanInsuranceRate.trim().length > 0) nested.insurance_rate = loanInsuranceRate.trim();
        if (loanInsuranceRateType.trim().length > 0)
          nested.insurance_rate_type = loanInsuranceRateType;
      }

      const response = await apiFetch(bootstrap.apiPaths.accounts, {
        method: "POST",
        body: JSON.stringify({
          account: {
            name: name.trim(),
            balance: balance.trim(),
            currency,
            account_type: accountType,
            subtype: subtype.trim().length > 0 ? subtype : undefined,
            opening_balance_date: openingBalanceDate,
            accountable: nested,
            ...(search.return_to === undefined ? {} : { return_to: search.return_to }),
          },
        }),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(data, labels.accountable_save_error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      if (
        typeof data === "object" &&
        data !== null &&
        "id" in data &&
        typeof data.id === "string" &&
        data.id.length > 0
      ) {
        void navigate({
          to: "/accounts/$accountId",
          params: { accountId: AccountIdSchema.parse(data.id) },
          resetScroll: false,
        });
      } else goBack();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : labels.accountable_save_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const subtypeOptions = optionsQuery.data?.subtypes[accountType] ?? [];
  const taxOptions = optionsQuery.data?.tax_treatments ?? [];
  const taxValue = taxTreatment === "" ? (taxOptions[0]?.value ?? "") : taxTreatment;
  const typeLabel =
    optionsQuery.data?.account_types.find((t) => t.value === accountType)?.label ?? accountType;
  const loanText = (key: string, fallback: string): string => {
    const value = labels[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };

  return (
    <Modal
      onClose={goBack}
      open
      panelClassName="relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]"
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary">
              {`${labels.accountable_title_new} — ${typeLabel}`}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">{labels.accountable_subtitle_new}</p>
          </div>
          <IconButton
            className="shrink-0"
            icon="x"
            label={labels.accountable_close}
            onClick={goBack}
          />
        </div>

        {optionsQuery.isPending ? (
          <output aria-busy="true" className="block h-20 animate-pulse rounded-xl bg-container" />
        ) : null}
        {optionsQuery.isError ? (
          <Alert live="alert" title={labels.accountable_options_error} variant="error">
            <p>{labels.accountable_options_error}</p>
          </Alert>
        ) : null}
        {submitError !== null ? (
          <Alert live="alert" title={submitError} variant="error">
            <p>{submitError}</p>
          </Alert>
        ) : null}

        <form
          className="flex grow flex-col justify-between gap-6"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="space-y-4">
            <FormField
              id="new-acct-name"
              label={labels.accountable_name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder={labels.accountable_name_placeholder}
              required
              type="text"
              value={name}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="new-acct-balance"
                label={labels.accountable_balance}
                onChange={(e) => {
                  setBalance(e.target.value);
                }}
                required
                step="0.01"
                type="number"
                value={balance}
              />
              <FormField
                id="new-acct-date"
                label={labels.accountable_opening_balance_date}
                onChange={(e) => {
                  setOpeningBalanceDate(e.target.value);
                }}
                required
                type="date"
                value={openingBalanceDate}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                as="select"
                id="new-acct-currency"
                label={labels.accountable_currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                }}
                value={currency}
              >
                {(optionsQuery.data?.currencies ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </FormField>
              {SUBTYPE_TYPES[accountType] ? (
                <SubtypeSelect
                  id="new-acct-subtype"
                  label={labels.accountable_subtype}
                  prompt={labels.accountable_subtype_prompt}
                  value={subtype}
                  onChange={setSubtype}
                  options={subtypeOptions}
                />
              ) : null}
            </div>

            {accountType === "vehicle" ? (
              <>
                <div className="flex items-center gap-2">
                  <FormField
                    id="new-acct-make"
                    label={labels.accountable_vehicle_make}
                    onChange={(e) => {
                      setMake(e.target.value);
                    }}
                    placeholder={labels.accountable_vehicle_make_placeholder}
                    type="text"
                    value={make}
                  />
                  <FormField
                    id="new-acct-model"
                    label={labels.accountable_vehicle_model}
                    onChange={(e) => {
                      setModel(e.target.value);
                    }}
                    placeholder={labels.accountable_vehicle_model_placeholder}
                    type="text"
                    value={model}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <FormField
                    id="new-acct-year"
                    label={labels.accountable_vehicle_year}
                    max={new Date().getFullYear() + 1}
                    min={1900}
                    onChange={(e) => {
                      setYear(e.target.value);
                    }}
                    placeholder={labels.accountable_vehicle_year_placeholder}
                    type="number"
                    value={year}
                  />
                  <FormField
                    id="new-acct-mileage"
                    label={labels.accountable_mileage}
                    min={0}
                    onChange={(e) => {
                      setMileageValue(e.target.value);
                    }}
                    placeholder={labels.accountable_mileage_placeholder}
                    type="number"
                    value={mileageValue}
                  />
                  <FormField
                    as="select"
                    id="new-acct-mileage-unit"
                    label={labels.accountable_mileage_unit}
                    onChange={(e) => {
                      setMileageUnit(e.target.value);
                    }}
                    value={mileageUnit}
                  >
                    {(optionsQuery.data?.mileage_units ?? []).map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </FormField>
                </div>
              </>
            ) : null}

            {accountType === "credit_card" ? (
              <>
                <FormField
                  id="new-acct-available-credit"
                  label={labels.accountable_credit_available_credit}
                  min={0}
                  onChange={(e) => {
                    setAvailableCredit(e.target.value);
                  }}
                  placeholder={labels.accountable_credit_available_credit_placeholder}
                  step="0.01"
                  type="number"
                  value={availableCredit}
                />
                <FormField
                  id="new-acct-payment-due-day"
                  label={labels.accountable_credit_payment_due_day}
                  min={1}
                  max={31}
                  step={1}
                  type="number"
                  value={paymentDueDay}
                  onChange={(e) => {
                    setPaymentDueDay(e.target.value);
                  }}
                />
                <p className="text-xs text-secondary">
                  {labels.accountable_credit_payment_due_day_hint}
                </p>
                <label className="flex items-center gap-2 text-sm text-primary">
                  <input
                    checked={minimumPaymentOnly}
                    className="checkbox checkbox--light"
                    onChange={(e) => {
                      setMinimumPaymentOnly(e.target.checked);
                    }}
                    type="checkbox"
                  />
                  <span>{labels.accountable_credit_minimum_payment_only}</span>
                </label>
                <p className="text-xs text-secondary">
                  {labels.accountable_credit_minimum_payment_only_hint}
                </p>
                <div className="flex items-center gap-2">
                  <FormField
                    id="new-acct-minimum-payment"
                    label={labels.accountable_credit_minimum_payment}
                    onChange={(e) => {
                      setMinimumPayment(e.target.value);
                    }}
                    placeholder={labels.accountable_credit_minimum_payment_placeholder}
                    step="0.01"
                    type="number"
                    value={minimumPayment}
                  />
                  <FormField
                    id="new-acct-apr"
                    label={labels.accountable_credit_apr}
                    min={0}
                    onChange={(e) => {
                      setApr(e.target.value);
                    }}
                    placeholder={labels.accountable_credit_apr_placeholder}
                    step="0.01"
                    type="number"
                    value={apr}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <FormField
                    id="new-acct-expiration"
                    label={labels.accountable_credit_expiration_date}
                    onChange={(e) => {
                      setExpirationDate(e.target.value);
                    }}
                    type="date"
                    value={expirationDate}
                  />
                  <FormField
                    id="new-acct-annual-fee"
                    label={labels.accountable_credit_annual_fee}
                    min={0}
                    onChange={(e) => {
                      setAnnualFee(e.target.value);
                    }}
                    placeholder={labels.accountable_credit_annual_fee_placeholder}
                    step="0.01"
                    type="number"
                    value={annualFee}
                  />
                </div>
              </>
            ) : null}

            {accountType === "crypto" ? (
              <FormField
                as="select"
                id="new-acct-tax-treatment"
                label={labels.accountable_crypto_tax_treatment}
                description={labels.accountable_crypto_tax_treatment_hint}
                onChange={(e) => {
                  setTaxTreatment(e.target.value);
                }}
                value={taxValue}
              >
                {taxOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormField>
            ) : null}

            {accountType === "loan" ? (
              <>
                <FormField
                  id="new-acct-loan-initial-balance"
                  label={loanText("accountable_loan_initial_balance", "Original loan balance")}
                  onChange={(e) => {
                    setLoanInitialBalance(e.target.value);
                  }}
                  required
                  step="0.01"
                  type="number"
                  value={loanInitialBalance}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    id="new-acct-loan-interest-rate"
                    label={loanText("accountable_loan_interest_rate", "Interest rate (%)")}
                    min={0}
                    onChange={(e) => {
                      setLoanInterestRate(e.target.value);
                    }}
                    step="0.005"
                    type="number"
                    value={loanInterestRate}
                  />
                  <FormField
                    as="select"
                    id="new-acct-loan-rate-type"
                    label={loanText("accountable_loan_rate_type", "Rate type")}
                    onChange={(e) => {
                      setLoanRateType(e.target.value);
                    }}
                    value={loanRateType}
                  >
                    {(optionsQuery.data?.loan_rate_types.length ?? 0) > 0 ? (
                      optionsQuery.data?.loan_rate_types.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="fixed">Fixed</option>
                        <option value="variable">Variable</option>
                        <option value="adjustable">Adjustable</option>
                      </>
                    )}
                  </FormField>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    id="new-acct-loan-down-payment"
                    label={loanText("accountable_loan_down_payment", "Down payment")}
                    min={0}
                    onChange={(e) => {
                      setLoanDownPayment(e.target.value);
                    }}
                    step="0.01"
                    type="number"
                    value={loanDownPayment}
                  />
                  <FormField
                    id="new-acct-loan-start-date"
                    label={loanText("accountable_loan_start_date", "Origination date")}
                    description={loanText("accountable_loan_start_date_hint", "")}
                    max={todayIso()}
                    onChange={(e) => {
                      setLoanStartDate(e.target.value);
                    }}
                    type="date"
                    value={loanStartDate}
                  />
                </div>
                <FormField
                  id="new-acct-loan-term-months"
                  label={loanText("accountable_loan_term_months", "Term (months)")}
                  max={1200}
                  min={1}
                  onChange={(e) => {
                    setLoanTermMonths(e.target.value);
                  }}
                  type="number"
                  value={loanTermMonths}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    id="new-acct-loan-insurance-rate"
                    label={loanText("accountable_loan_insurance_rate", "Insurance rate (%)")}
                    min={0}
                    onChange={(e) => {
                      setLoanInsuranceRate(e.target.value);
                    }}
                    step="0.005"
                    type="number"
                    value={loanInsuranceRate}
                  />
                  <FormField
                    as="select"
                    id="new-acct-loan-insurance-type"
                    label={loanText("accountable_loan_insurance_rate_type", "Insurance type")}
                    onChange={(e) => {
                      setLoanInsuranceRateType(e.target.value);
                    }}
                    value={loanInsuranceRateType}
                  >
                    <option value="">{loanText("accountable_loan_insurance_none", "None")}</option>
                    {(optionsQuery.data?.loan_insurance_rate_types ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FormField>
                </div>
                {loanText("accountable_loan_insurance_rate_hint", "").length > 0 ? (
                  <p className="text-xs text-secondary">
                    {loanText("accountable_loan_insurance_rate_hint", "")}
                  </p>
                ) : null}
              </>
            ) : null}

            {onBack === undefined ? (
              <p className="text-sm text-secondary">
                {labels.accountable_provider_description}{" "}
                <a className="underline" href={bootstrap.railsPaths.accounts}>
                  {labels.accountable_provider_open}
                </a>
              </p>
            ) : null}
          </div>

          <div className="mt-auto flex justify-between gap-2 pt-4">
            {onBack === undefined ? (
              <span />
            ) : (
              <Button onClick={onBack} type="button" variant="ghost">
                {loanText("property_back", "Back")}
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={goBack} type="button" variant="ghost">
                {labels.accountable_cancel}
              </Button>
              <Button disabled={isSubmitting} type="submit" variant="primary">
                {isSubmitting ? labels.accountable_saving : labels.accountable_save}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
