/* eslint-disable import/max-dependencies -- Property wizard composes property API, form options, form controls, and routing. */
import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { useState, type SyntheticEvent } from "react";
import * as z from "zod/mini";
import { accountDetailQueryOptions, type AccountDetail } from "./api/accounts";
import { apiFetch } from "./api/client";
import { apiErrorMessage } from "./accountable-drawer";
import type { SpaBootstrap } from "./bootstrap";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { AccountIdSchema, type AccountId } from "./ids";
import { Modal } from "./modal";

type Chrome = Record<string, string>;

type PropertyOption = { value: string; label: string; short_label?: string | null };

type PropertyFormOptions = {
  subtypes: PropertyOption[];
  area_units: { value: string; label: string }[];
  avm_providers: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  default_currency: string | null;
};

const PropertyFormOptionsSchema = z.object({
  subtypes: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      short_label: z.optional(z.nullable(z.string())),
    }),
  ),
  area_units: z.array(z.object({ value: z.string(), label: z.string() })),
  avm_providers: z.array(z.object({ value: z.string(), label: z.string() })),
  currencies: z.array(z.object({ value: z.string(), label: z.string() })),
  default_currency: z.nullable(z.string()),
});

const PropertyAccountRefSchema = z.object({
  id: z.pipe(z.uuid(), AccountIdSchema),
  status: z.string(),
});

const AvmPreviewSchema = z.object({
  provider_key: z.string(),
  preview: z.object({
    valuation: z.string(),
    currency: z.string(),
    property_type: z.nullable(z.string()),
    year_built: z.nullable(z.number()),
    area_value: z.nullable(z.number()),
    area_unit: z.string(),
  }),
  preview_token: z.string(),
});

type AvmPreview = z.infer<typeof AvmPreviewSchema>;

function propertyFormOptionsQueryOptions(endpoint: string) {
  return {
    queryKey: ["spa", "property-form-options"] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<PropertyFormOptions> => {
      const response = await apiFetch(endpoint, {
        signal,
      });
      if (!response.ok) throw new Error(`Property options request failed (${response.status})`);
      const payload: unknown = await response.json();
      return PropertyFormOptionsSchema.parse(payload);
    },
    staleTime: 300_000,
  };
}

function str(value: string | null | undefined): string {
  return value ?? "";
}
function num(value: number | null | undefined): string {
  return value !== undefined && value !== null ? String(value) : "";
}
export type NavigateToAccount = (options: {
  to: "/accounts/$accountId";
  params: { accountId: AccountId };
  search: Record<string, unknown>;
  resetScroll: false;
}) => Promise<void>;

function usePropertyText(): Chrome {
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  return { ...bootstrap.accountDetailText };
}

const DRAWER_PANEL =
  "relative flex size-full flex-col overflow-hidden rounded-xl bg-surface p-0 shadow-border-xs lg:w-[550px]";

function WizardShell({
  title,
  subtitle,
  onClose,
  closeLabel,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      ariaLabelledby="property-wizard-title"
      onClose={onClose}
      open
      panelClassName={DRAWER_PANEL}
      placement="drawer"
    >
      <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-medium text-primary" id="property-wizard-title">
              {title}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-secondary">{subtitle}</p>
          </div>
          <IconButton className="shrink-0" icon="x" label={closeLabel} onClick={onClose} />
        </div>
        {children}
      </div>
    </Modal>
  );
}

function StepTabs({ text, active }: { text: Chrome; active: "overview" | "value" | "address" }) {
  const steps = [
    { id: "overview" as const, label: text.property_step_overview },
    { id: "value" as const, label: text.property_step_value },
    { id: "address" as const, label: text.property_step_address },
  ];
  return (
    <ol aria-label={text.property_title_new} className="flex flex-col gap-0.5">
      {steps.map((step) => (
        <li
          aria-current={step.id === active ? "step" : undefined}
          className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
            step.id === active ? "bg-surface-inset text-primary" : "text-secondary"
          }`}
          key={step.id}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function WizardLayout({
  text,
  active,
  children,
}: {
  text: Chrome;
  active: "overview" | "value" | "address";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-[156px] shrink-0">
        <StepTabs active={active} text={text} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ---------- shared API helpers ---------- */

async function postPropertyJson(
  url: string,
  body: unknown,
): Promise<{ response: Response; payload: unknown }> {
  const response = await apiFetch(url, {
    body: JSON.stringify(body),
    method: "POST",
  });
  const payload: unknown = await response.json().catch(() => null);
  return { payload, response };
}

async function patchJson(
  url: string,
  body: unknown,
): Promise<{ response: Response; payload: unknown }> {
  const response = await apiFetch(url, {
    body: JSON.stringify(body),
    method: "PATCH",
  });
  const payload: unknown = await response.json().catch(() => null);
  return { payload, response };
}

function backToAccount(
  navigate: NavigateToAccount,
  accountId: string,
  search: Record<string, unknown>,
): void {
  void navigate({
    params: { accountId: AccountIdSchema.parse(accountId) },
    resetScroll: false,
    search: { ...search, tab: "overview" },
    to: "/accounts/$accountId",
  });
}

/* ---------- new: method selector ---------- */

export function PropertyNewDrawer() {
  const navigate = useNavigate();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const text = { ...bootstrap.accountDetailText };
  const optionsQuery = useQuery(
    propertyFormOptionsQueryOptions(bootstrap.apiPaths.propertyFormOptions),
  );

  function close() {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/transactions", resetScroll: false });
  }

  const providers = optionsQuery.data?.avm_providers ?? [];

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_subtitle_new}
      title={text.property_title_new}
    >
      {optionsQuery.isPending ? (
        <output aria-busy="true" className="block h-40 animate-pulse rounded-xl bg-container" />
      ) : null}
      {optionsQuery.isError ? (
        <Alert live="alert" title={text.accountable_options_error} variant="error">
          <p>{text.accountable_options_error}</p>
        </Alert>
      ) : null}
      {optionsQuery.data ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">{text.property_method_title}</p>
          <ul className="space-y-1">
            <li>
              <Button
                className="flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-left hover:bg-surface-hover"
                onClick={() => {
                  void navigate({ params: {}, resetScroll: false, to: "/properties/new/manual" });
                }}
                variant="ghost"
              >
                <Icon name="keyboard" />
                <span className="text-sm font-medium">{text.property_method_manual}</span>
                <Icon className="ml-auto shrink-0 text-subdued" name="chevron-right" size="sm" />
              </Button>
            </li>
            {providers.map((provider) => (
              <li key={provider.value}>
                <Button
                  className="flex w-full items-center gap-4 rounded-lg border border-transparent p-2 text-left hover:bg-surface-hover"
                  onClick={() => {
                    void navigate({
                      resetScroll: false,
                      search: { method: provider.value },
                      to: "/properties/new/avm",
                    });
                  }}
                  variant="ghost"
                >
                  <Icon name="map-pin" />
                  <span className="text-sm font-medium">
                    {text.property_method_avm.replace("%{provider}", provider.label)}
                  </span>
                  <Icon className="ml-auto shrink-0 text-subdued" name="chevron-right" size="sm" />
                </Button>
              </li>
            ))}
          </ul>
          {providers.length === 0 ? (
            <p className="text-sm text-secondary">
              <Button
                className="underline"
                onClick={() => {
                  void navigate({ params: {}, resetScroll: false, to: "/properties/new/manual" });
                }}
                variant="ghost"
              >
                {text.property_method_manual}
              </Button>
            </p>
          ) : null}
          {/* Provider OAuth/linking itself stays native: hand off to the full page. */}
          <p className="text-sm text-secondary">
            {text.accountable_provider_description}{" "}
            <a className="underline" href={bootstrap.railsPaths.accounts}>
              {text.accountable_provider_open}
            </a>
          </p>
        </div>
      ) : null}
    </WizardShell>
  );
}

/* ---------- new: manual overview step ---------- */

export function PropertyManualNewDrawer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const text = { ...bootstrap.accountDetailText };
  const optionsQuery = useQuery(
    propertyFormOptionsQueryOptions(bootstrap.apiPaths.propertyFormOptions),
  );

  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState("sqft");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function close() {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/transactions", resetScroll: false });
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const accountable: Record<string, unknown> = { subtype };
      if (yearBuilt.trim().length > 0) accountable.year_built = Number(yearBuilt);
      if (areaValue.trim().length > 0) accountable.area_value = Number(areaValue);
      accountable.area_unit = areaUnit;
      const { payload, response } = await postPropertyJson(bootstrap.apiPaths.properties, {
        account: { accountable_attributes: accountable, name: name.trim() },
      });
      if (!response.ok || response.status !== 201)
        throw new Error(apiErrorMessage(payload, text.accountable_save_error));
      const created = PropertyAccountRefSchema.parse(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      void navigate({
        params: { accountId: created.id },
        resetScroll: false,
        to: "/properties/$accountId/balances",
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : text.accountable_save_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const subtypes = optionsQuery.data?.subtypes ?? [];
  const areaUnits = optionsQuery.data?.area_units ?? [
    { label: text.property_square_feet, value: "sqft" },
    { label: text.property_square_meters, value: "sqm" },
  ];

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_subtitle_new}
      title={text.property_title_new}
    >
      <WizardLayout active="overview" text={text}>
        {optionsQuery.isError ? (
          <Alert live="status" title={text.accountable_options_error} variant="warning">
            <p>{text.accountable_options_error}</p>
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
          <div className="flex min-h-[320px] flex-col gap-2">
            <FormField
              id="property-name"
              label={text.property_name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder={text.property_name_placeholder}
              required
              type="text"
              value={name}
            />
            <FormField
              as="select"
              id="property-subtype"
              label={text.property_type}
              onChange={(e) => {
                setSubtype(e.target.value);
              }}
              required
              value={subtype}
            >
              <option value="">{text.property_type_prompt}</option>
              {subtypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FormField>
            <div className="flex items-center gap-2">
              <FormField
                id="property-year-built"
                label={text.property_year_built}
                max={new Date().getFullYear()}
                min={1500}
                onChange={(e) => {
                  setYearBuilt(e.target.value);
                }}
                placeholder={text.property_year_built_placeholder}
                type="number"
                value={yearBuilt}
              />
            </div>
            <div className="flex items-center gap-2">
              <FormField
                id="property-area-value"
                label={text.property_area}
                min={0}
                onChange={(e) => {
                  setAreaValue(e.target.value);
                }}
                placeholder={text.property_area_placeholder}
                type="number"
                value={areaValue}
              />
              <FormField
                as="select"
                id="property-area-unit"
                label={text.property_area_unit}
                onChange={(e) => {
                  setAreaUnit(e.target.value);
                }}
                value={areaUnit}
              >
                {areaUnits.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </FormField>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={close} type="button" variant="ghost">
              {text.cancel}
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting ? text.property_saving : text.property_next}
            </Button>
          </div>
        </form>
      </WizardLayout>
    </WizardShell>
  );
}

/* ---------- balances step (draft + active edit) ---------- */

function PropertyBalancesForm({
  account,
  onDone,
  text,
}: {
  account: AccountDetail;
  onDone: (accountId: string) => void;
  text: Chrome;
}) {
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const [balance, setBalance] = useState(num(account.balance));
  const [currency, setCurrency] = useState(account.currency);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const optionsQuery = useQuery(
    propertyFormOptionsQueryOptions(bootstrap.apiPaths.propertyFormOptions),
  );
  const isDraft = account.draft;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSavedNotice(null);
    try {
      const { payload, response } = await patchJson(
        `${bootstrap.apiPaths.accounts}/${encodeURIComponent(account.id)}`,
        { account: { balance: balance.trim(), currency } },
      );
      if (!response.ok) throw new Error(apiErrorMessage(payload, text.accountable_save_error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      if (isDraft) onDone(account.id);
      else setSavedNotice(text.accountable_updated.replace("%{type}", "Property"));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : text.accountable_save_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {submitError !== null ? (
        <Alert live="alert" title={submitError} variant="error">
          <p>{submitError}</p>
        </Alert>
      ) : null}
      {savedNotice !== null ? (
        <Alert live="status" title={savedNotice} variant="success">
          <p>{savedNotice}</p>
        </Alert>
      ) : null}
      <form
        className="flex grow flex-col justify-between gap-6"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="flex min-h-[320px] flex-col gap-4">
          <FormField
            id="property-balance"
            description={text.property_value_hint}
            label={text.property_value}
            onChange={(e) => {
              setBalance(e.target.value);
            }}
            placeholder="0"
            required
            step="0.01"
            type="number"
            value={balance}
          />
          <FormField
            as="select"
            id="property-currency"
            label={text.accountable_currency}
            onChange={(e) => {
              setCurrency(e.target.value);
            }}
            value={currency}
          >
            {(optionsQuery.data?.currencies ?? [{ label: currency, value: currency }]).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </FormField>
        </div>
        <div className="mt-4 flex justify-end gap-2 pt-4">
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting
              ? text.property_saving
              : isDraft
                ? text.property_next
                : text.property_save}
          </Button>
        </div>
      </form>
    </>
  );
}

export function PropertyBalancesDrawer() {
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const navigate = useNavigate();
  const text = usePropertyText();
  const accountQuery = useQuery(accountDetailQueryOptions(accountId, { page: 1, tab: "overview" }));
  const account = accountQuery.data;

  function close() {
    backToAccount(navigate, rawAccountId, {});
  }

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_subtitle_new}
      title={text.property_title_new}
    >
      <WizardLayout active="value" text={text}>
        {accountQuery.isPending ? (
          <output className="text-sm text-secondary">{text.accountable_loading}</output>
        ) : null}
        {accountQuery.isError ? (
          <Alert live="alert" title={text.unavailable} variant="error">
            <p>{text.unavailable}</p>
          </Alert>
        ) : null}
        {account !== undefined ? (
          <PropertyBalancesForm
            account={account}
            onDone={(id) => {
              void navigate({
                params: { accountId: AccountIdSchema.parse(id) },
                resetScroll: false,
                to: "/properties/$accountId/address",
              });
            }}
            text={text}
          />
        ) : null}
      </WizardLayout>
    </WizardShell>
  );
}

/* ---------- address step (draft activation + active edit) ---------- */

function PropertyAddressForm({
  account,
  onDone,
  text,
}: {
  account: AccountDetail;
  onDone: (accountId: string) => void;
  text: Chrome;
}) {
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const existing = account.accountable?.address ?? null;
  const [line1, setLine1] = useState(str(existing?.line1));
  const [line2, setLine2] = useState(str(existing?.line2));
  const [locality, setLocality] = useState(str(existing?.locality));
  const [region, setRegion] = useState(str(existing?.region));
  const [postalCode, setPostalCode] = useState(str(existing?.postal_code));
  const [country, setCountry] = useState(str(existing?.country));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const isDraft = account.draft;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSavedNotice(null);
    try {
      const { payload, response } = await patchJson(
        `${bootstrap.apiPaths.properties}/${encodeURIComponent(account.id)}/address`,
        {
          property: {
            address_attributes: {
              country: country.trim(),
              line1: line1.trim(),
              line2: line2.trim(),
              locality: locality.trim(),
              postal_code: postalCode.trim(),
              region: region.trim(),
            },
          },
        },
      );
      if (!response.ok) throw new Error(apiErrorMessage(payload, text.accountable_save_error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      if (isDraft) onDone(account.id);
      else setSavedNotice(text.accountable_updated.replace("%{type}", "Property"));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : text.accountable_save_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {submitError !== null ? (
        <Alert live="alert" title={submitError} variant="error">
          <p>{submitError}</p>
        </Alert>
      ) : null}
      {savedNotice !== null ? (
        <Alert live="status" title={savedNotice} variant="success">
          <p>{savedNotice}</p>
        </Alert>
      ) : null}
      <form
        className="flex grow flex-col justify-between gap-6"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="flex min-h-[320px] flex-col gap-2">
          <FormField
            id="property-line1"
            label={text.property_line1}
            onChange={(e) => {
              setLine1(e.target.value);
            }}
            placeholder={text.property_line1_placeholder}
            type="text"
            value={line1}
          />
          <FormField
            id="property-line2"
            label={text.property_line2}
            onChange={(e) => {
              setLine2(e.target.value);
            }}
            type="text"
            value={line2}
          />
          <div className="flex items-center gap-2">
            <FormField
              id="property-locality"
              label={text.property_city}
              onChange={(e) => {
                setLocality(e.target.value);
              }}
              placeholder={text.property_city_placeholder}
              type="text"
              value={locality}
            />
            <FormField
              id="property-region"
              label={text.property_region}
              onChange={(e) => {
                setRegion(e.target.value);
              }}
              placeholder={text.property_region_placeholder}
              type="text"
              value={region}
            />
          </div>
          <div className="flex items-center gap-2">
            <FormField
              id="property-postal-code"
              label={text.property_postal_code}
              onChange={(e) => {
                setPostalCode(e.target.value);
              }}
              placeholder={text.property_postal_code_placeholder}
              type="text"
              value={postalCode}
            />
            <FormField
              id="property-country"
              label={text.property_country}
              onChange={(e) => {
                setCountry(e.target.value);
              }}
              placeholder={text.property_country_placeholder}
              type="text"
              value={country}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? text.property_saving : text.property_save}
          </Button>
        </div>
      </form>
    </>
  );
}

export function PropertyAddressDrawer() {
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const navigate = useNavigate();
  const text = usePropertyText();
  const accountQuery = useQuery(accountDetailQueryOptions(accountId, { page: 1, tab: "overview" }));
  const account = accountQuery.data;

  function close() {
    backToAccount(navigate, rawAccountId, {});
  }

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_subtitle_new}
      title={text.property_title_new}
    >
      <WizardLayout active="address" text={text}>
        {accountQuery.isPending ? (
          <output className="text-sm text-secondary">{text.accountable_loading}</output>
        ) : null}
        {accountQuery.isError ? (
          <Alert live="alert" title={text.unavailable} variant="error">
            <p>{text.unavailable}</p>
          </Alert>
        ) : null}
        {account !== undefined ? (
          <PropertyAddressForm
            account={account}
            onDone={(id) => {
              backToAccount(navigate, id, {});
            }}
            text={text}
          />
        ) : null}
      </WizardLayout>
    </WizardShell>
  );
}

/* ---------- overview edit (active accounts) ---------- */

function PropertyOverviewForm({
  account,
  onClose,
  text,
}: {
  account: AccountDetail;
  onClose: () => void;
  text: Chrome;
}) {
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const accountable = account.accountable ?? null;
  const initYearBuilt = accountable?.year_built;
  const initAreaValue = accountable?.area_value;
  const [name, setName] = useState(account.name);
  const [subtype, setSubtype] = useState(str(account.subtype ?? accountable?.subtype));
  const [yearBuilt, setYearBuilt] = useState(
    num(typeof initYearBuilt === "number" ? initYearBuilt : null),
  );
  const [areaValue, setAreaValue] = useState(
    num(typeof initAreaValue === "number" ? initAreaValue : null),
  );
  const [areaUnit, setAreaUnit] = useState(str(accountable?.area_unit) || "sqft");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const optionsQuery = useQuery(
    propertyFormOptionsQueryOptions(bootstrap.apiPaths.propertyFormOptions),
  );

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { payload, response } = await patchJson(
        `${bootstrap.apiPaths.accounts}/${encodeURIComponent(account.id)}`,
        {
          account: {
            accountable: {
              area_unit: areaUnit,
              area_value: areaValue.trim().length > 0 ? Number(areaValue) : null,
              subtype,
              year_built: yearBuilt.trim().length > 0 ? Number(yearBuilt) : null,
            },
            name: name.trim(),
          },
        },
      );
      if (!response.ok) throw new Error(apiErrorMessage(payload, text.accountable_save_error));
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

  const subtypes = optionsQuery.data?.subtypes ?? [];
  const areaUnits = optionsQuery.data?.area_units ?? [
    { label: text.property_square_feet, value: "sqft" },
    { label: text.property_square_meters, value: "sqm" },
  ];

  return (
    <>
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
        <div className="flex min-h-[320px] flex-col gap-2">
          <FormField
            id="property-edit-name"
            label={text.property_name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder={text.property_name_placeholder}
            required
            type="text"
            value={name}
          />
          <FormField
            as="select"
            id="property-edit-subtype"
            label={text.property_type}
            onChange={(e) => {
              setSubtype(e.target.value);
            }}
            required
            value={subtype}
          >
            <option value="">{text.property_type_prompt}</option>
            {subtypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FormField>
          <div className="flex items-center gap-2">
            <FormField
              id="property-edit-year"
              label={text.property_year_built}
              max={new Date().getFullYear()}
              min={1500}
              onChange={(e) => {
                setYearBuilt(e.target.value);
              }}
              placeholder={text.property_year_built_placeholder}
              type="number"
              value={yearBuilt}
            />
          </div>
          <div className="flex items-center gap-2">
            <FormField
              id="property-edit-area"
              label={text.property_area}
              min={0}
              onChange={(e) => {
                setAreaValue(e.target.value);
              }}
              placeholder={text.property_area_placeholder}
              type="number"
              value={areaValue}
            />
            <FormField
              as="select"
              id="property-edit-area-unit"
              label={text.property_area_unit}
              onChange={(e) => {
                setAreaUnit(e.target.value);
              }}
              value={areaUnit}
            >
              {areaUnits.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FormField>
          </div>
        </div>
        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            {text.cancel}
          </Button>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting
              ? text.property_saving
              : account.draft
                ? text.property_next
                : text.property_save}
          </Button>
        </div>
      </form>
    </>
  );
}

export function PropertyEditDrawer() {
  const params = useParams({ strict: false });
  const rawAccountId = typeof params.accountId === "string" ? params.accountId : "";
  const accountId = AccountIdSchema.parse(rawAccountId);
  const navigate = useNavigate();
  const text = usePropertyText();
  const accountQuery = useQuery(accountDetailQueryOptions(accountId, { page: 1, tab: "overview" }));
  const account = accountQuery.data;

  function close() {
    backToAccount(navigate, rawAccountId, {});
  }

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_subtitle_edit}
      title={
        account === undefined
          ? text.property_title_edit
          : `${text.property_title_edit} ${account.name}`
      }
    >
      <WizardLayout active="overview" text={text}>
        {accountQuery.isPending ? (
          <output className="text-sm text-secondary">{text.accountable_loading}</output>
        ) : null}
        {accountQuery.isError ? (
          <Alert live="alert" title={text.unavailable} variant="error">
            <p>{text.unavailable}</p>
          </Alert>
        ) : null}
        {account !== undefined ? (
          <PropertyOverviewForm account={account} onClose={close} text={text} />
        ) : null}
      </WizardLayout>
    </WizardShell>
  );
}

/* ---------- AVM branch: lookup form → preview → signed confirm ---------- */

type AvmLookupState =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "preview"; preview: AvmPreview; name: string; address: AvmAddress }
  | { kind: "confirming"; preview: AvmPreview; name: string; address: AvmAddress };

type AvmAddress = {
  line1: string;
  locality: string;
  region: string;
  postal_code: string;
};

export function PropertyAvmDrawer({ providerKey }: { providerKey: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bootstrap = useRouteContext({
    from: "__root__",
    select: (ctx: { bootstrap: SpaBootstrap }) => ctx.bootstrap,
  });
  const text = { ...bootstrap.accountDetailText };
  const optionsQuery = useQuery(
    propertyFormOptionsQueryOptions(bootstrap.apiPaths.propertyFormOptions),
  );
  const providers = optionsQuery.data?.avm_providers ?? [];
  const providerName = providers.find((p) => p.value === providerKey)?.label ?? providerKey;

  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [state, setState] = useState<AvmLookupState>({ kind: "form" });
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function close() {
    if (window.history.length > 1) window.history.back();
    else void navigate({ to: "/transactions", resetScroll: false });
  }

  function backToLookup(lookupName: string, lookupAddress: AvmAddress) {
    setName(lookupName);
    setLine1(lookupAddress.line1);
    setLocality(lookupAddress.locality);
    setRegion(lookupAddress.region);
    setPostalCode(lookupAddress.postal_code);
    setState({ kind: "form" });
    setConfirmError(null);
  }

  async function handleLookup(event: SyntheticEvent) {
    event.preventDefault();
    if (state.kind === "loading" || state.kind === "confirming") return;
    setLookupError(null);
    setState({ kind: "loading" });
    try {
      const address: AvmAddress = {
        line1: line1.trim(),
        locality: locality.trim(),
        postal_code: postalCode.trim(),
        region: region.trim(),
      };
      const { payload, response } = await postPropertyJson(
        `${bootstrap.apiPaths.properties}/avm_lookup`,
        { account: { address, name: name.trim() }, avm_provider: providerKey },
      );
      if (!response.ok) throw new Error(apiErrorMessage(payload, text.accountable_save_error));
      const preview = AvmPreviewSchema.parse(payload);
      setState({ address, kind: "preview", name: name.trim(), preview });
    } catch (err) {
      setState({ kind: "form" });
      setLookupError(err instanceof Error ? err.message : text.accountable_save_error);
    }
  }

  async function handleConfirm(preview: AvmPreview) {
    if (state.kind !== "preview") return;
    const current = state;
    setState({ ...current, kind: "confirming" });
    setConfirmError(null);
    try {
      // The confirm step sends only the signed preview token (plus routing
      // params): everything is rebuilt server-side from the token payload,
      // so nothing user-editable is trusted.
      const { payload, response } = await postPropertyJson(
        `${bootstrap.apiPaths.properties}/avm_confirm`,
        {
          account: { accountable_type: "Property" },
          avm_preview_token: preview.preview_token,
          avm_provider: providerKey,
        },
      );
      if (!response.ok || response.status !== 201)
        throw new Error(apiErrorMessage(payload, text.property_confirm_error));
      const created = PropertyAccountRefSchema.parse(payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["spa", "account"] }),
        queryClient.invalidateQueries({ queryKey: ["spa", "summary"] }),
      ]);
      backToAccount(navigate, created.id, {});
    } catch (err) {
      setState({ address: current.address, kind: "preview", name: current.name, preview });
      setConfirmError(err instanceof Error ? err.message : text.property_confirm_error);
    }
  }

  const isBusy = state.kind === "loading" || state.kind === "confirming";
  const previewState = state.kind === "preview" || state.kind === "confirming" ? state : null;

  return (
    <WizardShell
      closeLabel={text.accountable_close}
      onClose={close}
      subtitle={text.property_lookup_description.replace("%{provider}", providerName)}
      title={text.property_lookup_title.replace("%{provider}", providerName)}
    >
      {previewState === null ? (
        <form
          className="flex grow flex-col justify-between gap-6"
          onSubmit={(event) => {
            void handleLookup(event);
          }}
        >
          <div className="flex min-h-80 flex-col gap-2">
            {lookupError !== null ? (
              <Alert live="alert" title={lookupError} variant="error">
                <p>{lookupError}</p>
              </Alert>
            ) : null}
            <p className="text-sm text-secondary">
              {text.property_lookup_us_only.replace("%{provider}", providerName)}
            </p>
            <FormField
              id="property-avm-name"
              label={text.property_name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder={text.property_name_placeholder}
              required
              type="text"
              value={name}
            />
            <FormField
              id="property-avm-line1"
              label={text.property_line1}
              onChange={(e) => {
                setLine1(e.target.value);
              }}
              placeholder={text.property_line1_placeholder}
              required
              type="text"
              value={line1}
            />
            <div className="flex items-center gap-2">
              <FormField
                id="property-avm-locality"
                label={text.property_city}
                onChange={(e) => {
                  setLocality(e.target.value);
                }}
                placeholder={text.property_city_placeholder}
                required
                type="text"
                value={locality}
              />
              <FormField
                id="property-avm-region"
                label={text.property_region}
                onChange={(e) => {
                  setRegion(e.target.value);
                }}
                placeholder={text.property_region_placeholder}
                required
                type="text"
                value={region}
              />
            </div>
            <div className="flex items-center gap-2">
              <FormField
                id="property-avm-postal"
                label={text.property_postal_code}
                onChange={(e) => {
                  setPostalCode(e.target.value);
                }}
                placeholder={text.property_postal_code_placeholder}
                required
                type="text"
                value={postalCode}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={close} type="button" variant="ghost">
              {text.cancel}
            </Button>
            <Button disabled={isBusy} type="submit" variant="primary">
              {state.kind === "loading"
                ? text.property_lookup_searching
                : text.property_lookup_submit}
            </Button>
          </div>
        </form>
      ) : (
        <AvmPreviewView
          address={previewState.address}
          confirming={state.kind === "confirming"}
          confirmError={confirmError}
          name={previewState.name}
          onBack={() => {
            backToLookup(previewState.name, previewState.address);
          }}
          onConfirm={() => {
            void handleConfirm(previewState.preview);
          }}
          preview={previewState.preview}
          providerName={providerName}
          text={text}
        />
      )}
    </WizardShell>
  );
}

function AvmPreviewView({
  preview,
  name,
  address,
  providerName,
  confirming,
  confirmError,
  onBack,
  onConfirm,
  text,
}: {
  preview: AvmPreview;
  name: string;
  address: AvmAddress;
  providerName: string;
  confirming: boolean;
  confirmError: string | null;
  onBack: () => void;
  onConfirm: () => void | Promise<void>;
  text: Chrome;
}) {
  const unknown = text.property_preview_unknown;
  const noRecord =
    preview.preview.property_type === null &&
    preview.preview.year_built === null &&
    preview.preview.area_value === null;
  const addressLine = [address.line1, address.locality, address.region, address.postal_code]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(", ");
  return (
    <div className="flex grow flex-col gap-4">
      <p className="text-sm text-secondary">
        {text.property_preview_description.replace("%{provider}", providerName)}
      </p>
      {confirmError !== null ? (
        <Alert live="alert" title={confirmError} variant="error">
          <p>{confirmError}</p>
        </Alert>
      ) : null}
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_name}</dt>
          <dd className="font-medium text-primary">{name}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_line1}</dt>
          <dd className="text-right font-medium text-primary">{addressLine}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_type}</dt>
          <dd className="font-medium text-primary">{preview.preview.property_type ?? unknown}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_year_built}</dt>
          <dd className="font-medium text-primary">{preview.preview.year_built ?? unknown}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_area}</dt>
          <dd className="font-medium text-primary">
            {preview.preview.area_value === null
              ? unknown
              : `${preview.preview.area_value} ${preview.preview.area_unit}`}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-secondary">{text.property_value}</dt>
          <dd className="privacy-sensitive font-medium text-primary">
            {preview.preview.valuation} {preview.preview.currency}
          </dd>
        </div>
      </dl>
      {noRecord ? (
        <p className="text-sm text-secondary">
          {text.property_preview_no_record.replace("%{provider}", providerName)}
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-between">
        <Button onClick={onBack} type="button" variant="ghost">
          {text.property_back}
        </Button>
        <Button
          disabled={confirming}
          onClick={() => void onConfirm()}
          type="button"
          variant="primary"
        >
          {confirming ? text.property_saving : text.property_preview_confirm}
        </Button>
      </div>
    </div>
  );
}

export function validatePropertyAvmSearch(search: Record<string, unknown>): { method?: string } {
  const method = search.method;
  if (typeof method === "string" && method.length > 0) return { method };
  return {};
}
