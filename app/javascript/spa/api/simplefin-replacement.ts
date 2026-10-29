import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountIdSchema } from "../ids";
import { apiFetch } from "./client";

const AccountSchema = z.object({ id: AccountIdSchema, name: z.string(), currency: z.string() });
const LinkedAccountSchema = z.object({ id: AccountIdSchema, name: z.string() });
const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  balance: z.nullable(z.string()),
  account_type: z.nullable(z.string()),
  linked_account: z.nullable(LinkedAccountSchema),
});
const PickerSchema = z.object({
  account: AccountSchema,
  candidates: z.array(CandidateSchema),
  text: z.record(z.string(), z.string()),
});
const EntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  amount: z.string(),
  currency: z.string(),
  pending: z.boolean(),
  split: z.boolean(),
  transfer: z.boolean(),
  entryable_type: z.optional(z.string()),
});
const PreviewSchema = z.object({
  fingerprint: z.string(),
  account: AccountSchema,
  replacement: z.object({ id: z.string(), name: z.string(), currency: z.string() }),
  source_account: z.nullable(LinkedAccountSchema),
  canonical_entries: z.array(EntrySchema),
  incoming_entries: z.array(EntrySchema),
  suggested_matches: z.array(
    z.object({
      incoming_id: z.string(),
      survivor_id: z.string(),
      reason: z.string(),
      preselect: z.optional(z.boolean()),
    }),
  ),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  balance: z.object({
    current: z.string(),
    expected: z.nullable(z.string()),
    replacement: z.string(),
    currency: z.string(),
    discrepancy: z.nullable(z.string()),
  }),
  summary: z.object({ incoming_count: z.number(), candidate_count: z.number() }),
});
const ApplyResultSchema = z.object({ account_id: AccountIdSchema, operation_id: z.string() });
const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export type ReplacementPicker = z.infer<typeof PickerSchema>;
export type ReplacementPreview = z.infer<typeof PreviewSchema>;
export type ReplacementEntry = z.infer<typeof EntrySchema>;
export type ReplacementMatch = { incoming_id: string; survivor_id: string };
export type ReplacementApplyRequest = {
  simplefin_account_id: string;
  fingerprint: string;
  matches: ReplacementMatch[];
  accept_balance_difference: boolean;
  idempotency_key: string;
};

export class ReplacementApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReplacementApiError";
  }
}

async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await apiFetch(path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorSchema.safeParse(payload);
    throw new ReplacementApiError(
      response.status,
      error.success ? error.data.error : "request_failed",
      error.success ? error.data.message : "",
    );
  }
  return payload;
}

function replacementPath(accountId: string): string {
  return `/api/v1/accounts/${encodeURIComponent(accountId)}/provider_replacement`;
}

export function replacementPickerQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: ["spa", "provider-replacement", accountId] as const,
    queryFn: async ({ signal }) =>
      PickerSchema.parse(await request(replacementPath(accountId), undefined, signal)),
    staleTime: 0,
  });
}

export async function previewReplacement(
  accountId: string,
  simplefinAccountId: string,
  matches?: ReplacementMatch[],
) {
  return PreviewSchema.parse(
    await request(`${replacementPath(accountId)}/preview`, {
      simplefin_account_id: simplefinAccountId,
      ...(matches === undefined ? {} : { matches }),
    }),
  );
}

export async function applyReplacement(accountId: string, body: ReplacementApplyRequest) {
  return ApplyResultSchema.parse(await request(`${replacementPath(accountId)}/apply`, body));
}
