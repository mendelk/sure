import { DialogTitle } from "@headlessui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type SubmitEvent } from "react";
import { z } from "zod";
import { invalidateAccountQueries } from "./api/account-spa";
import {
  emptyProviderActionResult,
  providerActionResultSchema,
  providerBrokeragesSchema,
  providerConnectionPath,
  providerMetadataSchema,
  providerRequest,
  providerStatusesSchema,
  type ProviderAction,
  type ProviderActionResult,
  type ProviderField,
  type ProviderSetup,
} from "./api/provider-connections";
import { Alert } from "./components/alert";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Modal } from "./modal";

type Values = Partial<Record<string, string | boolean | string[]>>;
type Selection = {
  id: string;
  accountable_type: string;
  subtype: string;
  account_id: string;
  owner_id: string;
  sync_start_date: string;
  balance: string;
};
type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidSdk = {
  create: (options: {
    token: string;
    onSuccess: (token: string, metadata: { institution?: { name?: string } }) => void;
    onExit: (error: { display_message?: string } | null) => void;
  }) => PlaidHandler;
};

const plaidSdkSchema = z.object({
  create: z.custom<PlaidSdk["create"]>((value: unknown) => typeof value === "function"),
});

async function plaidSdk(): Promise<PlaidSdk> {
  const current: unknown = Reflect.get(window, "Plaid");
  const existing = plaidSdkSchema.safeParse(current);
  if (existing.success) return existing.data;
  const { promise, resolve, reject } = Promise.withResolvers<null>();
  const src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
  let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (script === null) {
    script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.append(script);
  }
  const loadedScript = script;
  const timeout = window.setTimeout(() => {
    loadedScript.remove();
    reject(new Error("Timed out loading Plaid Link"));
  }, 10_000);
  loadedScript.addEventListener(
    "load",
    () => {
      window.clearTimeout(timeout);
      resolve(null);
    },
    { once: true },
  );
  loadedScript.addEventListener(
    "error",
    () => {
      window.clearTimeout(timeout);
      loadedScript.remove();
      reject(new Error("Could not load Plaid Link"));
    },
    { once: true },
  );
  await promise;
  const loaded: unknown = Reflect.get(window, "Plaid");
  return plaidSdkSchema.parse(loaded);
}

function DynamicField({
  field,
  values,
  onChange,
  questions,
}: {
  field: ProviderField;
  values: Values;
  onChange: (name: string, value: string | boolean) => void;
  questions?: string[];
}) {
  const value = values[field.name] ?? field.value ?? (field.type === "checkbox" ? false : "");
  const base = {
    id: `provider-${field.name}`,
    label: field.label,
    required: field.required,
    description: field.configured
      ? "Already configured. Leave blank to keep the current credential."
      : undefined,
  };
  if (field.name === "security_answers") {
    const answers = String(value).split("\n");
    return (
      <div className="space-y-3">
        {(questions !== undefined && questions.length > 0 ? questions : ["Security answer"]).map(
          (question, index) => (
            <FormField
              key={question}
              id={`provider-security-answer-${index}`}
              label={question}
              type="password"
              required
              value={answers[index] ?? ""}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.target.value;
                onChange(field.name, next.join("\n"));
              }}
            />
          ),
        )}
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <FormField
        {...base}
        as="select"
        value={String(value)}
        onChange={(event) => {
          onChange(field.name, event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FormField>
    );
  }
  if (field.type === "textarea") {
    return (
      <FormField
        {...base}
        as="textarea"
        value={String(value)}
        onChange={(event) => {
          onChange(field.name, event.target.value);
        }}
      />
    );
  }
  if (field.type === "checkbox") {
    return (
      <FormField
        {...base}
        type="checkbox"
        checked={value === true}
        onChange={(event) => {
          onChange(field.name, event.target.checked);
        }}
      />
    );
  }
  return (
    <FormField
      {...base}
      type={field.type}
      autoComplete={field.type === "password" ? "new-password" : undefined}
      value={String(value)}
      onChange={(event) => {
        onChange(field.name, event.target.value);
      }}
    />
  );
}

function SetupForm({
  provider,
  setup,
  accountableType,
  pending,
  onSave,
}: {
  provider: string;
  setup: ProviderSetup;
  accountableType?: string;
  pending: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [selections, setSelections] = useState<Partial<Record<string, Selection>>>({});
  const [startDate, setStartDate] = useState(setup.sync_start_date);
  const [stale, setStale] = useState<
    Partial<Record<string, { action: string; target_account_id: string }>>
  >({});
  const selection = (account: ProviderSetup["accounts"][number]): Selection =>
    selections[account.id] ?? {
      id: account.id,
      accountable_type:
        account.accountable_type !== "" ? account.accountable_type : (accountableType ?? "skip"),
      subtype: account.suggested_subtype,
      account_id: "",
      owner_id: setup.default_owner_id,
      sync_start_date: account.sync_start_date,
      balance: "",
    };
  function change(account: ProviderSetup["accounts"][number], updates: Partial<Selection>) {
    setSelections((current) => ({
      ...current,
      [account.id]: { ...selection(account), ...updates },
    }));
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      selections: setup.unlinked_accounts.map(selection).map((row) => ({
        id: row.id,
        accountable_type: row.accountable_type,
        subtype: row.subtype,
        owner_id: row.owner_id,
        account_id: row.account_id !== "" ? row.account_id : undefined,
        sync_start_date: row.sync_start_date || undefined,
        balance: row.balance || undefined,
      })),
      sync_start_date: startDate || undefined,
      stale_account_actions: stale,
    });
  }
  if (!setup.supports_setup) {
    return (
      <p className="text-sm text-secondary">Manage these account mappings in Wallet enrollment.</p>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {setup.supports_sync_start_date ? (
        <FormField
          id="provider-sync-start-date"
          type="date"
          label="Sync start date"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
          }}
        />
      ) : null}
      {setup.unlinked_accounts.length === 0 ? (
        <p className="text-sm text-secondary">
          {setup.syncing
            ? "Accounts are being discovered. Refresh after syncing finishes."
            : "No accounts need setup. Sync this connection to discover accounts."}
        </p>
      ) : null}
      {setup.unlinked_accounts.map((account) => {
        const row = selection(account);
        const type = setup.account_types.find((option) => option.value === row.accountable_type);
        const candidates = setup.linkable_accounts.filter((candidate) =>
          account.linkable_account_ids.includes(candidate.id),
        );
        return (
          <fieldset className="space-y-3 rounded-lg border border-primary p-4" key={account.id}>
            <legend className="px-1 text-sm font-medium text-primary">
              {account.name}{" "}
              {account.balance === "" ? "" : `(${account.balance} ${account.currency})`}
            </legend>
            <FormField
              as="select"
              id={`provider-account-${account.id}`}
              label="Create or link account"
              value={row.account_id !== "" ? row.account_id : "new"}
              onChange={(event) => {
                change(account, {
                  account_id: event.target.value === "new" ? "" : event.target.value,
                });
              }}
            >
              <option value="new">Create a new account</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </FormField>
            {row.account_id === "" ? (
              <>
                <FormField
                  as="select"
                  id={`provider-type-${account.id}`}
                  label="Account type"
                  value={row.accountable_type}
                  onChange={(event) => {
                    change(account, { accountable_type: event.target.value, subtype: "" });
                  }}
                >
                  <option value="skip">Skip this account</option>
                  {setup.account_types
                    .filter((option) => account.allowed_accountable_types.includes(option.value))
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </FormField>
                {type && type.subtypes.length > 0 && row.accountable_type !== "skip" ? (
                  <FormField
                    as="select"
                    id={`provider-subtype-${account.id}`}
                    label="Account subtype"
                    value={row.subtype}
                    onChange={(event) => {
                      change(account, { subtype: event.target.value });
                    }}
                  >
                    <option value="">Default</option>
                    {type.subtypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormField>
                ) : null}
                {row.accountable_type !== "skip" ? (
                  <FormField
                    as="select"
                    id={`provider-owner-${account.id}`}
                    label="Account owner"
                    value={row.owner_id}
                    onChange={(event) => {
                      change(account, { owner_id: event.target.value });
                    }}
                  >
                    {setup.owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </FormField>
                ) : null}
              </>
            ) : null}
            {["questrade", "redbark", "indexa_capital"].includes(provider) &&
            row.account_id === "" &&
            row.accountable_type !== "skip" ? (
              <FormField
                id={`provider-balance-${account.id}`}
                label="Initial balance (optional)"
                type="number"
                step="any"
                value={row.balance}
                onChange={(event) => {
                  change(account, { balance: event.target.value });
                }}
              />
            ) : null}
            {setup.supports_account_sync_start_date ? (
              <FormField
                id={`provider-date-${account.id}`}
                label="Account sync start date"
                type="date"
                value={row.sync_start_date}
                onChange={(event) => {
                  change(account, { sync_start_date: event.target.value });
                }}
              />
            ) : null}
          </fieldset>
        );
      })}
      {setup.linked_accounts.map((account) => (
        <p className="text-sm text-secondary" key={account.id}>
          {account.name} is linked
          {account.linked_account_name ? ` to ${account.linked_account_name}` : ""}.
        </p>
      ))}
      {setup.stale_accounts.map((account) => (
        <fieldset className="space-y-3 rounded-lg border border-primary p-4" key={account.id}>
          <legend className="text-sm text-primary">
            {account.name} is no longer available upstream
          </legend>
          <FormField
            as="select"
            id={`stale-action-${account.id}`}
            label="Action"
            value={stale[account.id]?.action ?? "skip"}
            onChange={(event) => {
              setStale((current) => ({
                ...current,
                [account.id]: { action: event.target.value, target_account_id: "" },
              }));
            }}
          >
            <option value="skip">Keep unchanged</option>
            <option value="delete">Delete the stale account</option>
            <option value="move">Move transactions to another account</option>
          </FormField>
          {stale[account.id]?.action === "move" ? (
            <FormField
              as="select"
              id={`stale-target-${account.id}`}
              label="Move transactions to"
              required
              value={stale[account.id]?.target_account_id ?? ""}
              onChange={(event) => {
                setStale((current) => ({
                  ...current,
                  [account.id]: { action: "move", target_account_id: event.target.value },
                }));
              }}
            >
              <option value="">Choose an account</option>
              {setup.linked_accounts
                .filter((candidate) => candidate.linked_account_id !== account.linked_account_id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.linked_account_id}>
                    {candidate.linked_account_name !== ""
                      ? candidate.linked_account_name
                      : candidate.name}
                  </option>
                ))}
            </FormField>
          ) : null}
        </fieldset>
      ))}
      <Button type="submit" variant="primary" disabled={pending}>
        Save account setup
      </Button>
    </form>
  );
}

function LinkExistingForm({
  setup,
  accountId,
  pending,
  onLink,
}: {
  setup: ProviderSetup;
  accountId: string;
  pending: boolean;
  onLink: (body: unknown) => Promise<void>;
}) {
  const [providerAccountId, setProviderAccountId] = useState("");
  const [startDate, setStartDate] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onLink({
          account_id: accountId,
          provider_account_id: providerAccountId,
          sync_start_date: startDate || undefined,
        });
      }}
    >
      <FormField
        as="select"
        id="provider-link-existing"
        label="Provider account to link"
        required
        value={providerAccountId}
        onChange={(event) => {
          setProviderAccountId(event.target.value);
        }}
      >
        <option value="">Choose an account</option>
        {setup.accounts
          .filter((account) => account.linkable_account_ids.includes(accountId))
          .map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.linked_account_name
                ? ` (currently linked to ${account.linked_account_name})`
                : ""}
            </option>
          ))}
      </FormField>
      {setup.supports_account_sync_start_date ? (
        <FormField
          id="provider-link-start-date"
          type="date"
          label="Sync start date"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
          }}
        />
      ) : null}
      <Button disabled={pending || !providerAccountId} type="submit" variant="primary">
        Link account
      </Button>
    </form>
  );
}

export function ProviderConnectionDrawer({
  provider,
  connectionId,
  mode,
  accountId,
  accountableType,
  region,
  onClose,
}: {
  provider: string;
  connectionId?: string;
  mode: "new" | "edit" | "setup" | "manage";
  accountId?: string;
  accountableType?: string;
  region?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [id, setId] = useState(connectionId);
  const [view, setView] = useState(mode);
  const [values, setValues] = useState<Values>({
    region: region ?? "us",
    accountable_type: accountableType ?? "Depository",
  });
  const [activeAction, setActiveAction] = useState<string>("");
  const [result, setResult] = useState<ProviderActionResult>(emptyProviderActionResult);
  const [assets, setAssets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = providerConnectionPath(provider, id);
  const metadata = useQuery({
    queryKey: ["provider-connection", provider, id],
    queryFn: () =>
      id !== undefined
        ? providerRequest(base, providerMetadataSchema)
        : providerRequest(
            `/api/v1/provider_connections/form_options?provider=${encodeURIComponent(provider)}`,
            providerMetadataSchema,
          ),
  });
  const available = useQuery({
    queryKey: ["provider-connections"],
    queryFn: () => providerRequest("/api/v1/provider_connections", providerStatusesSchema),
    enabled: connectionId === undefined,
  });
  const brokerages = useQuery({
    queryKey: ["provider-brokerages", id],
    queryFn: () => providerRequest(`${base}/connections`, providerBrokeragesSchema),
    enabled: provider === "snaptrade" && id !== undefined && view === "manage",
  });
  const workspace =
    metadata.data !== undefined && "connection" in metadata.data ? metadata.data : undefined;
  const configuration =
    metadata.data !== undefined && "fields" in metadata.data
      ? metadata.data
      : workspace?.configuration;
  const action = configuration?.actions.find((candidate) => candidate.name === activeAction);
  const options = available.data?.filter((candidate) => candidate.provider === provider) ?? [];
  function update(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }
  async function refresh() {
    await Promise.all([
      metadata.refetch(),
      queryClient.invalidateQueries({ queryKey: ["provider-connections"] }),
      invalidateAccountQueries(queryClient),
    ]);
  }
  async function run(operation: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The provider request failed");
    } finally {
      setPending(false);
    }
  }
  async function execute(selected: ProviderAction) {
    const body: Record<string, unknown> = { action: selected.name };
    for (const field of selected.fields) {
      body[field.name] =
        values[field.name] ?? field.value ?? (field.type === "checkbox" ? false : "");
    }
    if (selected.fields.some((field) => field.name === "assets")) body.assets = assets;
    if (typeof body.security_answers === "string")
      body.security_answers = body.security_answers.split("\n").filter(Boolean);
    if (selected.name === "link_exchange") {
      body.connection_fields = Object.fromEntries(
        Object.entries(values)
          .filter(([name]) => name.startsWith("connection_fields."))
          .map(([name, value]) => [name.slice("connection_fields.".length), value]),
      );
    }
    const response = await providerRequest(
      `${base}/configure`,
      providerActionResultSchema,
      "POST",
      body,
    );
    if (selected.name === "link_token") {
      const sdk = await plaidSdk();
      const { promise, resolve, reject } = Promise.withResolvers<null>();
      const handler = sdk.create({
        token: response.link_token,
        onSuccess: (publicToken, details) => {
          void (async () => {
            try {
              if (id === undefined) {
                const created = await providerRequest(
                  providerConnectionPath(provider),
                  providerActionResultSchema,
                  "POST",
                  {
                    public_token: publicToken,
                    name: details.institution?.name,
                    region: values.region,
                  },
                );
                setId(created.id);
                setView("setup");
              }
              await refresh();
              resolve(null);
            } catch (caught) {
              reject(caught);
            } finally {
              handler.destroy();
            }
          })();
        },
        onExit: (caught) => {
          handler.destroy();
          if (caught !== null) reject(new Error(caught.display_message ?? "Plaid Link failed"));
          else resolve(null);
        },
      });
      handler.open();
      await promise;
      return;
    }
    setResult((previous) =>
      selected.name === "device_complete" && response.status === "pending"
        ? { ...previous, status: response.status }
        : response,
    );
    if (selected.name === "device_complete" && response.status !== "pending")
      update("flow_token", "");
    if (response.item_id !== "" && response.item_id !== id) setId(response.item_id);
    if (response.id !== "" && id === undefined) {
      setId(response.id);
      setView("manage");
    }
    if (response.challenge !== null && response.challenge !== undefined) {
      const challenge = response.challenge;
      const mfaType =
        challenge.security_questions.length > 0
          ? "security_answer"
          : challenge.token_methods.length > 0
            ? "token_choice"
            : challenge.captcha_image !== ""
              ? "captcha"
              : "token_input";
      update("mfa_type", mfaType);
      setActiveAction("submit_mfa");
      setView("manage");
    }
    if (response.flow_token !== "") {
      update("flow_token", response.flow_token);
      setView("manage");
      setActiveAction("device_complete");
    }
    if (selected.name === "preview_wallet" || selected.name === "review_tokens")
      setAssets(response.assets.filter((asset) => asset.preselected).map((asset) => asset.key));
    if (response.chain !== "") update("chain", response.chain);
    if (response.address !== "") update("address", response.address);
    await refresh();
    setNotice("Provider request completed.");
  }
  async function saveConfiguration(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const body = Object.fromEntries(
        (configuration?.fields ?? []).map((field) => [
          field.name,
          values[field.name] ?? field.value ?? "",
        ]),
      );
      if (id !== undefined) await providerRequest(base, providerActionResultSchema, "PATCH", body);
      else {
        const created = await providerRequest(base, providerActionResultSchema, "POST", body);
        setId(created.id);
        setView("manage");
      }
      setValues((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([name]) =>
              configuration?.fields.some(
                (field) => field.name === name && ["password", "textarea"].includes(field.type),
              ) !== true,
          ),
        ),
      );
      await refresh();
      setNotice("Connection saved.");
    });
  }
  const pickAction = (name: string) => {
    setActiveAction(name);
    setError(null);
  };
  const exchange = result.exchanges.find(
    (entry) => entry.connection_id === values.exchange_connection_id,
  );
  const fields = exchange?.connection_fields ?? [];
  const challenge = result.challenge;
  const securityQuestions = challenge?.security_questions ?? [];
  const tokenMethods = challenge?.token_methods ?? [];
  const captchaImage =
    challenge?.captcha_image.split(/[^A-Za-z0-9+/=\s]/u, 1)[0]?.replaceAll(/\s/gu, "") ?? "";
  const actionFields =
    action?.fields.filter((field) => {
      if (field.name === "assets") return false;
      if (action.name !== "submit_mfa" || field.name === "mfa_type") return true;
      const expected =
        field.name === "security_answers"
          ? "security_answer"
          : field.name === "captcha_input"
            ? "captcha"
            : field.name;
      return expected === values.mfa_type;
    }) ?? [];
  return (
    <Modal
      ariaLabelledby="provider-drawer-title"
      onClose={onClose}
      open
      panelClassName="h-full w-full max-w-xl overflow-y-auto rounded-xl bg-container p-6"
      placement="drawer"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-lg font-medium text-primary" id="provider-drawer-title">
            {configuration?.name ?? "Provider connection"}
          </DialogTitle>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
        {error !== null || metadata.error !== null ? (
          <Alert variant="error">{error ?? metadata.error?.message}</Alert>
        ) : null}
        {notice !== null && notice !== "" ? (
          <output className="block text-sm text-secondary">{notice}</output>
        ) : null}
        {metadata.isPending ? <p className="text-sm text-secondary">Loading connection…</p> : null}
        {connectionId === undefined && options.length > 0 ? (
          <FormField
            as="select"
            id="provider-existing-connection"
            label="Connection"
            value={id ?? "new"}
            onChange={(event) => {
              setId(event.target.value === "new" ? undefined : event.target.value);
              setView(event.target.value === "new" ? "new" : "setup");
              setValues({
                region: region ?? "us",
                accountable_type: accountableType ?? "Depository",
              });
              setResult(emptyProviderActionResult);
            }}
          >
            <option value="new">Add a new connection</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </FormField>
        ) : null}
        {id !== undefined ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setView("setup");
              }}
            >
              Account setup
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setView("edit");
              }}
            >
              Configuration
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setView("manage");
              }}
            >
              Manage
            </Button>
            <Button
              disabled={pending}
              variant="secondary"
              onClick={() => {
                void run(async () => {
                  setResult(
                    await providerRequest(`${base}/sync`, providerActionResultSchema, "POST", {}),
                  );
                  await refresh();
                  setNotice("Sync requested.");
                });
              }}
            >
              Sync
            </Button>
            <Button
              disabled={pending}
              variant="secondary"
              onClick={() => {
                void run(refresh);
              }}
            >
              Refresh status
            </Button>
          </div>
        ) : null}
        {configuration !== undefined && configuration.authorization.href !== "" ? (
          <a className="text-sm text-link underline" href={configuration.authorization.href}>
            Authorize {configuration.name}
          </a>
        ) : null}
        {configuration !== undefined &&
        configuration.authorization.authorization_href !== "" &&
        configuration.authorization.authorization_href !== configuration.authorization.href ? (
          <a
            className="text-sm text-link underline"
            href={configuration.authorization.authorization_href}
          >
            Reconnect authorization
          </a>
        ) : null}
        {configuration?.authorization.flows.map((flow) =>
          flow.href !== "" && flow.href !== configuration.authorization.href ? (
            <a className="block text-sm text-link underline" href={flow.href} key={flow.name}>
              {flow.name.replaceAll("_", " ")}
            </a>
          ) : null,
        )}
        {workspace ? (
          <p className="text-sm text-secondary">
            Status: {workspace.connection.status}
            {workspace.connection.sync.syncing ? " · syncing" : ""}
          </p>
        ) : null}
        {workspace !== undefined && view === "setup" ? (
          accountId !== undefined ? (
            <LinkExistingForm
              setup={workspace.setup}
              accountId={accountId}
              pending={pending}
              onLink={async (body) => {
                await run(async () => {
                  setResult(
                    await providerRequest(`${base}/link`, providerActionResultSchema, "POST", body),
                  );
                  await refresh();
                  setNotice("Account linked.");
                });
              }}
            />
          ) : (
            <SetupForm
              key={`${id ?? "new"}-${metadata.dataUpdatedAt}`}
              provider={provider}
              setup={workspace.setup}
              accountableType={accountableType}
              pending={pending}
              onSave={async (body) => {
                await run(async () => {
                  setResult(
                    await providerRequest(
                      `${base}/setup`,
                      providerActionResultSchema,
                      "PATCH",
                      body,
                    ),
                  );
                  await refresh();
                  setNotice("Account setup saved.");
                });
              }}
            />
          )
        ) : null}
        {configuration !== undefined &&
        (view === "new" || view === "edit") &&
        configuration.fields.length > 0 ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              void saveConfiguration(event);
            }}
          >
            {configuration.fields.map((field) => (
              <DynamicField key={field.name} field={field} values={values} onChange={update} />
            ))}
            <Button disabled={pending} type="submit" variant="primary">
              {id !== undefined ? "Save connection" : "Create connection"}
            </Button>
          </form>
        ) : null}
        {configuration !== undefined && view !== "setup" ? (
          <div className="space-y-3">
            <FormField
              as="select"
              id="provider-action"
              label="Connection action"
              value={activeAction}
              onChange={(event) => {
                pickAction(event.target.value);
              }}
            >
              <option value="">Choose an action</option>
              {configuration.actions.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.label}
                </option>
              ))}
            </FormField>
            {action !== undefined ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => execute(action));
                }}
              >
                {actionFields.map((field) => (
                  <DynamicField
                    key={field.name}
                    field={field}
                    values={values}
                    onChange={update}
                    questions={securityQuestions}
                  />
                ))}
                {action.name === "link_exchange"
                  ? fields.map((field) => (
                      <DynamicField
                        key={field.key}
                        field={{
                          name: `connection_fields.${field.key}`,
                          label:
                            field.label !== ""
                              ? field.label
                              : field.name !== ""
                                ? field.name
                                : field.key,
                          type: "password",
                          required: false,
                          configured: false,
                          options: [],
                        }}
                        values={values}
                        onChange={update}
                      />
                    ))
                  : null}
                <Button disabled={pending} type="submit" variant="primary">
                  {action.label}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-3" aria-live="polite">
          {result.status !== "" ? <p className="text-sm text-secondary">{result.status}</p> : null}
          {result.authorization_url !== "" ? (
            <a className="text-sm text-link underline" href={result.authorization_url}>
              Continue to bank authorization
            </a>
          ) : null}
          {result.verification_uri_complete !== "" || result.verification_uri !== "" ? (
            <a
              className="text-sm text-link underline"
              href={
                result.verification_uri_complete !== ""
                  ? result.verification_uri_complete
                  : result.verification_uri
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Open device authorization
            </a>
          ) : null}
          {result.user_code !== "" ? (
            <FormField
              id="provider-device-code"
              label="Device verification code"
              readOnly
              value={result.user_code}
            />
          ) : null}
          {result.warnings.map((warning) => (
            <Alert key={warning.message} variant="warning">
              {warning.message}
            </Alert>
          ))}
          {result.banks.map((bank) => (
            <Button
              key={bank.name}
              variant="secondary"
              onClick={() => {
                update("aspsp_name", bank.name);
                update("psu_type", bank.psu_types[0] ?? "personal");
                pickAction("authorize");
              }}
            >
              {bank.name}
            </Button>
          ))}
          {result.qr_code_image !== "" ? (
            <img
              alt="Scan to authorize the connection"
              className="size-64"
              src={result.qr_code_image}
            />
          ) : null}
          {tokenMethods.map((method) => (
            <Button
              key={method}
              variant="secondary"
              onClick={() => {
                update("mfa_type", "token_choice");
                update("token_choice", method);
                pickAction("submit_mfa");
              }}
            >
              {method}
            </Button>
          ))}
          {captchaImage !== "" ? (
            <img
              alt="Provider security challenge"
              className="max-w-full rounded-lg"
              src={`data:image/png;base64,${captchaImage}`}
            />
          ) : null}
          {challenge !== null && challenge !== undefined && challenge.token_read !== "" ? (
            <p className="text-sm text-primary">{challenge.token_read}</p>
          ) : null}
          {result.public_key !== "" ? (
            <FormField
              as="textarea"
              id="provider-public-key"
              label="Public key"
              readOnly
              value={result.public_key}
            />
          ) : null}
          {result.assets.map((asset) => (
            <FormField
              key={asset.key}
              id={`wallet-asset-${asset.key}`}
              label={`${asset.name} (${asset.symbol}) ${asset.quantity}`}
              type="checkbox"
              checked={assets.includes(asset.key)}
              onChange={(event) => {
                setAssets((current) =>
                  event.target.checked
                    ? [...current, asset.key]
                    : current.filter((key) => key !== asset.key),
                );
              }}
            />
          ))}
          {result.assets_truncated ? (
            <p className="text-sm text-warning">
              The provider returned only part of the wallet&apos;s assets.
            </p>
          ) : null}
          {result.chains.map((chain) => (
            <Button
              key={chain.value}
              variant="secondary"
              onClick={() => {
                update("chain", chain.value);
                pickAction("preview_wallet");
              }}
            >
              {chain.label}
            </Button>
          ))}
          {result.profiles.map((profile) => (
            <Button
              key={profile.id}
              variant="secondary"
              onClick={() => {
                update("profile_id", profile.id);
              }}
            >
              Use profile {profile.id} ({profile.type})
            </Button>
          ))}
          {result.institutions.map((institution) => (
            <Button
              key={institution.id}
              variant="secondary"
              onClick={() => {
                update("institution_id", institution.id);
                update("institution_name", institution.name);
                pickAction("connect_institution");
              }}
            >
              {institution.name}
            </Button>
          ))}
          {result.blockchains.map((chain) => (
            <Button
              key={chain.value !== "" ? chain.value : chain.name}
              variant="secondary"
              onClick={() => {
                update("blockchain", chain.value !== "" ? chain.value : chain.name);
                pickAction("link_wallet");
              }}
            >
              {chain.label !== "" ? chain.label : chain.name}
            </Button>
          ))}
          {result.exchanges.map((item) => (
            <Button
              key={item.connection_id}
              variant="secondary"
              onClick={() => {
                update("exchange_connection_id", item.connection_id);
                update("exchange_connection_name", item.name);
                pickAction("link_exchange");
              }}
            >
              {item.name}
            </Button>
          ))}
        </div>
        {id !== undefined && view === "manage" ? (
          <div className="space-y-3">
            {provider === "snaptrade"
              ? brokerages.data?.map((brokerage) => (
                  <div
                    key={brokerage.authorization_id}
                    className="space-y-2 rounded-lg border border-primary p-3"
                  >
                    <p className="font-medium text-primary">{brokerage.brokerage_name}</p>
                    {brokerage.accounts.map((account) => (
                      <p key={account.id} className="text-sm text-secondary">
                        {account.name}
                        {account.linked ? " · linked" : ""}
                      </p>
                    ))}
                    <Button
                      disabled={pending}
                      variant="secondary"
                      onClick={() => {
                        void run(async () => {
                          await providerRequest(
                            `${base}/connections/${encodeURIComponent(brokerage.authorization_id)}`,
                            providerActionResultSchema,
                            "DELETE",
                          );
                          await brokerages.refetch();
                          await refresh();
                        });
                      }}
                    >
                      Remove brokerage
                    </Button>
                  </div>
                ))
              : null}
            <Button
              disabled={pending}
              variant="secondary"
              onClick={() => {
                void run(async () => {
                  await providerRequest(
                    `${base}/cancel_sync`,
                    providerActionResultSchema,
                    "POST",
                    {},
                  );
                  await refresh();
                  setNotice("Cancellation requested.");
                });
              }}
            >
              Cancel sync
            </Button>
            {confirmRemove ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">
                  Remove this connection? Provider-specific account cleanup will be applied.
                </p>
                <Button
                  disabled={pending}
                  variant="secondary"
                  onClick={() => {
                    setConfirmRemove(false);
                  }}
                >
                  Keep connection
                </Button>
                <Button
                  disabled={pending}
                  variant="primary"
                  onClick={() => {
                    void run(async () => {
                      await providerRequest(base, providerActionResultSchema, "DELETE");
                      await invalidateAccountQueries(queryClient);
                      onClose();
                    });
                  }}
                >
                  Confirm removal
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmRemove(true);
                }}
              >
                Remove connection
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
