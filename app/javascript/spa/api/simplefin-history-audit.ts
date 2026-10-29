import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountIdSchema } from "../ids";
import { apiFetch } from "./client";

export const AUDIT_STATUSES = [
  "recorded",
  "intentionally_deleted",
  "possible_match",
  "missing",
  "pending",
  "invalid",
  "identity_conflict",
] as const;
const NullableString = z.nullable(z.string());
const CandidateSchema = z.object({
  entry_id: z.string(),
  transaction_id: z.string(),
  name: z.string(),
  date: z.string(),
  amount: z.string(),
  currency: z.string(),
  source: NullableString,
  parent_entry_id: NullableString,
});
const TransactionSchema = z.object({
  simplefin_account_id: z.string(),
  provider_transaction_id: NullableString,
  external_id: NullableString,
  date: NullableString,
  name: NullableString,
  amount: NullableString,
  currency: NullableString,
  entry_id: NullableString,
  transaction_id: NullableString,
  import_token: NullableString,
  possible_matches: z.array(CandidateSchema),
  status: z.enum(AUDIT_STATUSES),
});
const AuditPageSchema = z.object({
  account_id: AccountIdSchema,
  read_only: z.literal(true),
  coverage: z.object({
    period_days: z.number(),
    has_more_connections: z.boolean(),
    window_start_date: z.string(),
    window_end_date: z.string(),
    simplefin_item_id: z.string(),
    page_complete: z.boolean(),
    provider_history_complete: z.literal(false),
  }),
  feeds: z.array(
    z.object({
      simplefin_account_id: z.string(),
      provider_account_id: z.string(),
      name: z.string(),
      retired: z.boolean(),
      returned: z.boolean(),
      transaction_count: z.number(),
    }),
  ),
  transactions: z.array(TransactionSchema),
  summary: z.record(z.string(), z.number()),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      simplefin_account_id: z.optional(z.string()),
    }),
  ),
  next_cursor: NullableString,
  retry_cursor: NullableString,
});
const MetadataSchema = z.object({
  account: z.object({ id: AccountIdSchema, name: z.string(), currency: z.string() }),
  default_period_days: z.number(),
  max_period_days: z.number(),
  text: z.record(z.string(), z.string()),
});
const ErrorSchema = z.object({ error: z.string(), message: z.string() });
const ImportResultSchema = z.object({
  transactions: z.array(
    z.object({
      simplefin_account_id: z.string(),
      provider_transaction_id: z.string(),
      entry_id: z.string(),
      transaction_id: z.string(),
    }),
  ),
});

export type AuditPage = z.infer<typeof AuditPageSchema>;
export type AuditTransaction = z.infer<typeof TransactionSchema>;
export type AuditMetadata = z.infer<typeof MetadataSchema>;
export type AuditRequest = { period_days?: number; cursor?: string };
export type AuditImportDecision = { token: string; entry_id: string | null };
type AuditImportRequest = { decisions: AuditImportDecision[] };

export class HistoryAuditApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HistoryAuditApiError";
  }
}

async function request(
  path: string,
  signal: AbortSignal,
  body?: AuditRequest | AuditImportRequest,
): Promise<unknown> {
  const response = await apiFetch(path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorSchema.safeParse(payload);
    throw new HistoryAuditApiError(
      response.status,
      error.success ? error.data.error : "request_failed",
      error.success ? error.data.message : "",
    );
  }
  return payload;
}

export function historyAuditMetadataQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: ["spa", "simplefin-history-audit", accountId] as const,
    queryFn: async ({ signal }) =>
      MetadataSchema.parse(
        await request(
          `/api/v1/accounts/${encodeURIComponent(accountId)}/simplefin_history_audit`,
          signal,
        ),
      ),
    retry: false,
    staleTime: 0,
  });
}

export async function fetchHistoryAuditPage(
  accountId: string,
  body: AuditRequest,
  signal: AbortSignal,
) {
  return AuditPageSchema.parse(
    await request(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/simplefin_history_audit`,
      signal,
      body,
    ),
  );
}

export async function importHistoryAuditTransactions(
  accountId: string,
  decisions: AuditImportDecision[],
  signal: AbortSignal,
) {
  return ImportResultSchema.parse(
    await request(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/simplefin_history_audit/import`,
      signal,
      { decisions },
    ),
  );
}
