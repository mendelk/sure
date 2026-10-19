import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountIdSchema, UserIdSchema, StatementIdSchema, type StatementId } from "../ids";
import { readCsrfToken } from "./transactions";

export { StatementIdSchema };
export type { StatementId };

// The Rails payload marks actions with keys; the SPA translates keys to
// behaviour. Confirm payloads are the CustomConfirm shape (title/body/btnText)
// from the ERB dialogs.
const ConfirmSchema = z.object({
  title: z.string(),
  body: z.string(),
  confirmText: z.string(),
  variant: z.string(),
});
type Confirm = z.infer<typeof ConfirmSchema>;

export const SyncControlsSchema = z.object({
  syncing: z.boolean(),
  sync_href: z.string(),
  cancel_path: z.nullable(z.string()),
  syncing_label: z.string(),
  cancel_label: z.string(),
});

export const SpaActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  href: z.string(),
  method: z.optional(z.enum(["get", "post", "patch", "delete"])),
  icon: z.optional(z.string()),
  params: z.optional(z.record(z.string(), z.string())),
  confirm: z.optional(ConfirmSchema),
});
export type SpaAction = z.infer<typeof SpaActionSchema>;

const AccountRowSchema = z.object({
  id: z.pipe(z.string(), AccountIdSchema),
  name: z.string(),
  accountable_type: z.string(),
  subtype_label: z.string(),
  currency: z.string(),
  balance: z.string(),
  status: z.string(),
  syncing: z.boolean(),
  draft: z.boolean(),
  pending_deletion: z.boolean(),
  active: z.boolean(),
  exclude_from_reports: z.boolean(),
  shared: z.boolean(),
  owned: z.boolean(),
  owner_name: z.nullable(z.string()),
  institution_name: z.nullable(z.string()),
  logo_url: z.nullable(z.string()),
  color: z.string(),
  is_default: z.boolean(),
  set_default_eligible: z.boolean(),
  manageable: z.boolean(),
  href: z.string(),
  edit_href: z.string(),
  sharing_href: z.string(),
  actions: z.array(SpaActionSchema),
});

export const AccountGroupSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string(),
  total: z.string(),
  syncing: z.boolean(),
  accounts: z.array(AccountRowSchema),
});

const EmptyStateSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const WalletCardSchema = z.object({
  address_count: z.optional(z.number()),
  accounts: z.optional(z.array(AccountRowSchema)),
  sync_href: z.optional(z.string()),
  delete_href: z.optional(z.string()),
});

export const ProviderItemSchema = z.object({
  kind: z.string(),
  provider_key: z.string(),
  id: z.string(),
  name: z.string(),
  logo_url: z.nullable(z.string()),
  logo_text: z.nullable(z.string()),
  logo_icon: z.optional(z.nullable(z.string())),
  logo_color: z.nullable(z.string()),
  status: z.string(),
  status_label: z.nullable(z.string()),
  syncing: z.boolean(),
  scheduled_for_deletion: z.boolean(),
  group: z.nullable(z.array(AccountGroupSchema)),
  empty: z.nullable(EmptyStateSchema),
  wallet: z.optional(z.nullable(WalletCardSchema)),
  manage_href: z.optional(z.nullable(z.string())),
  manage_label: z.optional(z.nullable(z.string())),
  delete_href: z.optional(z.nullable(z.string())),
  setup_href: z.optional(z.nullable(z.string())),
  confirm_delete: z.optional(ConfirmSchema),
  replacement_prompts: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      relink_label: z.string(),
      account_id: AccountIdSchema,
      dismiss_label: z.string(),
      relink_href: z.string(),
      dismiss_href: z.nullable(z.string()),
      dormant_sfa_id: z.string(),
      active_sfa_id: z.string(),
    }),
  ),
});

export const AccountsIndexSchema = z.object({
  sync: SyncControlsSchema,
  new_account_path: z.string(),
  items: z.array(ProviderItemSchema),
  groups: z.array(AccountGroupSchema),
});
export type AccountsIndex = z.infer<typeof AccountsIndexSchema>;
export type AccountListRow = AccountsIndex["groups"][number]["accounts"][number];
export type ProviderItem = AccountsIndex["items"][number];

export class AccountSpaApiError extends Error {
  constructor(
    readonly status: number,
    message = `Account request failed (${status})`,
  ) {
    super(message);
    this.name = "AccountSpaApiError";
  }
}
export const AccountsIndexApiError = AccountSpaApiError;

export function accountsIndexQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "accounts-index", path] as const,
    queryFn: async ({ signal }): Promise<AccountsIndex> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new AccountsIndexApiError(response.status);
      const payload: unknown = await response.json();
      return AccountsIndexSchema.parse(payload);
    },
    // Sync states change server-side while this page is open; stay live so
    // spinner rows and status labels settle without a full reload, like the
    // ERB broadcasts did.
    refetchInterval: (query) => (query.state.data?.sync.syncing === true ? 3000 : false),
  });
}

/* ---------- sharing ---------- */

export const SharingMemberSchema = z.object({
  id: z.pipe(z.string(), UserIdSchema),
  name: z.string(),
  initials: z.string(),
  shared: z.boolean(),
  permission: z.string(),
  include_in_finances: z.nullable(z.boolean()),
});
export type SharingMember = z.infer<typeof SharingMemberSchema>;

export const SharingPayloadSchema = z.object({
  owned: z.boolean(),
  owner: z.nullable(z.object({ name: z.string(), initials: z.string() })),
  viewer_permission: z.nullable(z.string()),
  member: z.nullable(z.object({ include_in_finances: z.boolean() })),
  permissions: z.record(z.string(), z.string()),
  members: z.array(SharingMemberSchema),
  no_members: z.boolean(),
  moniker: z.string(),
  update_href: z.string(),
});
export type SharingPayload = z.infer<typeof SharingPayloadSchema>;

export const SharingApiError = AccountSpaApiError;

export function sharingQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: ["spa", "sharing", accountId] as const,
    queryFn: async ({ signal }): Promise<SharingPayload> => {
      const response = await fetch(`/accounts/${encodeURIComponent(accountId)}/sharing.json`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new SharingApiError(response.status);
      const payload: unknown = await response.json();
      return SharingPayloadSchema.parse(payload);
    },
    staleTime: 5_000,
  });
}

export const SharingFormMemberSchema = z.object({
  user_id: z.pipe(z.string(), UserIdSchema),
  shared: z.boolean(),
  permission: z.string(),
});
export type SharingFormMember = z.infer<typeof SharingFormMemberSchema>;

// Submits the same `sharing[members][]` patch the ERB dialog posted, so the
// permission model has one writer.
export async function updateSharing(
  accountId: string,
  members: SharingFormMember[],
): Promise<void> {
  const body = {
    sharing: {
      members: Object.fromEntries(members.map((member, index) => [String(index), member])),
    },
  };
  const response = await fetch(`/accounts/${encodeURIComponent(accountId)}/sharing.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!response.ok) throw new SharingApiError(response.status);
}

export async function updateFinanceInclusion(
  accountId: string,
  includeInFinances: boolean,
): Promise<void> {
  const response = await fetch(`/accounts/${encodeURIComponent(accountId)}/sharing.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() },
    body: JSON.stringify({
      update_finance_inclusion: "1",
      include_in_finances: String(includeInFinances),
    }),
    credentials: "same-origin",
  });
  if (!response.ok) throw new SharingApiError(response.status);
}

/* ---------- statements ---------- */

const StatementRowSchema = z.object({
  id: z.pipe(z.string(), StatementIdSchema),
  filename: z.string(),
  size: z.string(),
  icon: z.string(),
  period: z.string(),
  review_status: z.string(),
  account: z.nullable(z.string()),
  suggestion: z.nullable(
    z.object({ id: z.pipe(z.string(), AccountIdSchema), name: z.string(), confidence: z.string() }),
  ),
  href: z.string(),
  download_href: z.nullable(z.string()),
  link_href: z.nullable(z.string()),
  reject_href: z.nullable(z.string()),
});

const StatementGroupSchema = z.object({
  count: z.number(),
  items: z.array(StatementRowSchema),
  page: z.number(),
  per_page: z.number(),
  total_pages: z.number(),
});

export const StatementsIndexSchema = z.object({
  upload: z.object({
    href: z.string(),
    accounts: z.array(z.object({ id: z.pipe(z.string(), AccountIdSchema), name: z.string() })),
    accept: z.string(),
    max_size_mb: z.number(),
  }),
  storage_used: z.string(),
  unmatched: StatementGroupSchema,
  linked: StatementGroupSchema,
});
export type StatementsIndex = z.infer<typeof StatementsIndexSchema>;
export type StatementRow = StatementsIndex["unmatched"]["items"][number];

export const StatementsApiError = AccountSpaApiError;

export function statementsIndexQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "statements-index", path] as const,
    queryFn: async ({ signal }): Promise<StatementsIndex> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new StatementsApiError(response.status);
      const payload: unknown = await response.json();
      return StatementsIndexSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

export const ReconciliationCheckSchema = z.object({
  label: z.string(),
  status: z.string(),
  status_label: z.string(),
  amounts: z.object({ statement: z.string(), ledger: z.string(), difference: z.string() }),
});

export const StatementDetailSchema = z.object({
  can_manage: z.boolean(),
  id: z.pipe(z.string(), StatementIdSchema),
  filename: z.string(),
  status: z.string(),
  status_label: z.string(),
  size: z.string(),
  content_type: z.string(),
  download_href: z.nullable(z.string()),
  destroy_href: z.string(),
  confirm_delete: ConfirmSchema,
  account: z.nullable(z.object({ id: z.pipe(z.string(), AccountIdSchema), name: z.string() })),
  suggested_account: z.nullable(
    z.object({ id: z.pipe(z.string(), AccountIdSchema), name: z.string(), confidence: z.string() }),
  ),
  period: z.string(),
  balances: z.object({ opening: z.string(), closing: z.string() }),
  metadata: z.object({
    institution_name: z.nullable(z.string()),
    account_name: z.nullable(z.string()),
    account_last4: z.nullable(z.string()),
    currency: z.string(),
    period_start_on: z.nullable(z.string()),
    period_end_on: z.nullable(z.string()),
    opening_balance: z.nullable(z.string()),
    closing_balance: z.nullable(z.string()),
  }),
  reconciliation: z.array(ReconciliationCheckSchema),
  actions: z.object({
    link_href: z.string(),
    unlink_href: z.string(),
    reject_href: z.string(),
  }),
  accounts: z.array(z.object({ id: z.pipe(z.string(), AccountIdSchema), name: z.string() })),
});
export type StatementDetail = z.infer<typeof StatementDetailSchema>;

export function statementDetailQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "statement", path] as const,
    queryFn: async ({ signal }): Promise<StatementDetail> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new StatementsApiError(response.status);
      const payload: unknown = await response.json();
      return StatementDetailSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

export const StatementMutateError = AccountSpaApiError;

const ApiErrorMessageSchema = z.object({ message: z.string() });

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    const parsed = ApiErrorMessageSchema.safeParse(payload);
    if (parsed.success && parsed.data.message.length > 0) return parsed.data.message;
  } catch {
    /* Non-JSON error body falls back to the status message. */
  }
  return fallback;
}

// PATCH metadata, mirroring the ERB form's `account_statement[...]` params so
// one controller path serves both. Returns parsed error message on failure.
export async function updateStatementMetadata(
  id: string,
  attrs: Partial<
    Record<
      | "institution_name_hint"
      | "account_name_hint"
      | "account_last4_hint"
      | "currency"
      | "period_start_on"
      | "period_end_on"
      | "opening_balance"
      | "closing_balance"
      | "account_id",
      string | null
    >
  >,
): Promise<void> {
  const response = await fetch(`/account_statements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() },
    body: JSON.stringify({ account_statement: attrs }),
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new StatementMutateError(
      response.status,
      await readErrorMessage(response, `Update failed (${response.status})`),
    );
  }
}

export async function mutateStatement(
  id: string,
  action: "link" | "unlink" | "reject" | "destroy",
  params: Record<string, string> = {},
): Promise<void> {
  const response = await fetch(
    `/account_statements/${encodeURIComponent(id)}${action === "destroy" ? "" : `/${action}`}`,
    {
      method: action === "destroy" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() },
      body: action === "destroy" ? undefined : JSON.stringify(params),
      credentials: "same-origin",
    },
  );
  if (!response.ok) {
    throw new StatementMutateError(
      response.status,
      await readErrorMessage(response, `Request failed (${response.status})`),
    );
  }
}

export async function invalidateAccountQueries(queryClient: {
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<void>;
}): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["spa", "accounts-index"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "statements-index"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "statement"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "account"] });
  await queryClient.invalidateQueries({ queryKey: ["spa", "summary"] });
}

// Runs a server-driven account action (disable/enable, sync, delete) as a
// same-origin fetch: CSRF header for auth, method override for patch/delete,
// then the caller invalidates so lists re-render without a reload.
export async function postAccountAction(action: {
  href: string;
  method?: "delete" | "get" | "patch" | "post";
  params?: Record<string, string>;
}): Promise<void> {
  const body = new URLSearchParams();
  const method = action.method ?? "post";
  if (method !== "post" && method !== "get") body.set("_method", method);
  for (const [name, value] of Object.entries(action.params ?? {})) body.set(name, value);

  const response = await fetch(action.href, {
    body: method === "get" ? null : body,
    credentials: "same-origin",
    headers: {
      Accept: "application/json, text/html",
      "X-CSRF-Token": readCsrfToken(),
    },
    method: method === "get" ? "GET" : "POST",
    redirect: "manual",
  });
  if (!response.ok && response.type !== "opaqueredirect")
    throw new Error(`Action failed with status ${response.status}`);
}

export type { Confirm };
