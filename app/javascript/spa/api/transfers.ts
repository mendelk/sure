import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import {
  AccountIdSchema,
  CategoryIdSchema,
  TagIdSchema,
  TransactionIdSchema,
  TransferIdSchema,
  type CategoryId,
  type TagId,
  type TransferId,
} from "../ids";
import { TransactionApiError } from "./transactions";
import { apiFetch } from "./client";

const SpaTransferSideSchema = z.object({
  id: TransactionIdSchema,
  entry_id: z.string(),
  date: z.string(),
  amount: z.string(),
  amount_cents: z.number(),
  currency: z.string(),
  name: z.string(),
  kind: z.string(),
  account: z.object({
    id: AccountIdSchema,
    name: z.string(),
    account_type: z.nullable(z.string()),
    logo_url: z.optional(z.nullable(z.string())),
    color: z.optional(z.nullable(z.string())),
  }),
});

const SpaTransferSchema = z.object({
  id: TransferIdSchema,
  status: z.enum(["pending", "confirmed"]),
  date: z.string(),
  amount: z.string(),
  amount_cents: z.number(),
  currency: z.string(),
  transfer_type: z.enum(["transfer", "liability_payment", "loan_payment"]),
  permissions: z.object({ can_edit: z.boolean() }),
  name: z.optional(z.nullable(z.string())),
  payment: z.optional(z.nullable(z.boolean())),
  categorizable: z.optional(z.nullable(z.boolean())),
  notes: z.nullable(z.string()),
  source_fee_amount: z.optional(z.nullable(z.string())),
  source_fee_currency: z.optional(z.nullable(z.string())),
  destination_fee_amount: z.optional(z.nullable(z.string())),
  destination_fee_currency: z.optional(z.nullable(z.string())),
  inflow_transaction: SpaTransferSideSchema,
  outflow_transaction: SpaTransferSideSchema,
  category: z.optional(
    z.nullable(
      z.object({
        id: CategoryIdSchema,
        name: z.string(),
        color: z.string(),
        icon: z.string(),
      }),
    ),
  ),
  tags: z.array(
    z.object({
      id: TagIdSchema,
      name: z.string(),
      color: z.optional(z.string()),
    }),
  ),
  can_mark_as_recurring: z.optional(z.nullable(z.boolean())),
  recurring_exists: z.optional(z.nullable(z.boolean())),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SpaTransferSide = z.infer<typeof SpaTransferSideSchema>;
export type SpaTransfer = z.infer<typeof SpaTransferSchema>;

export type TransferUpdatePayload = {
  status?: "confirmed" | "rejected";
  notes?: string | null;
  category_id?: CategoryId | null;
  tag_ids?: TagId[];
};

export function transferDetailQueryOptions(basePath: string, transferId: TransferId) {
  return queryOptions({
    queryKey: ["spa", "transfer", basePath, transferId] as const,
    queryFn: ({ signal }) => requestTransfer(basePath, transferId, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

export async function requestTransfer(
  basePath: string,
  transferId: TransferId,
  signal?: AbortSignal,
): Promise<SpaTransfer> {
  const response = await apiFetch(`${basePath}/${transferId}`, { signal });
  if (response.status === 200) {
    const payload: unknown = await response.json();
    return SpaTransferSchema.parse(payload);
  }
  if (response.status === 404) throw new TransactionApiError("Transfer not found", response.status);
  throw new TransactionApiError("Failed to load transfer", response.status);
}

export async function updateTransfer(
  basePath: string,
  transferId: TransferId,
  payload: TransferUpdatePayload,
): Promise<SpaTransfer> {
  const response = await apiFetch(`${basePath}/${transferId}`, {
    method: "PATCH",
    body: JSON.stringify({ transfer: payload }),
  });
  if (response.status === 200) {
    const data: unknown = await response.json();
    return SpaTransferSchema.parse(data);
  }
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : "Failed to update transfer";
  throw new TransactionApiError(message, response.status);
}

export async function deleteTransfer(basePath: string, transferId: TransferId): Promise<void> {
  const response = await apiFetch(`${basePath}/${transferId}`, { method: "DELETE" });
  if (response.status === 204 || response.status === 200) return;
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : "Failed to delete transfer";
  throw new TransactionApiError(message, response.status);
}

const RecurringMarkResultSchema = z.object({
  message: z.string(),
  recurring_transaction_id: z.optional(z.string()),
});

export async function markTransferAsRecurring(
  basePath: string,
  transferId: TransferId,
): Promise<{ message: string; recurring_transaction_id?: string }> {
  const response = await apiFetch(`${basePath}/${transferId}/mark_as_recurring`, {
    method: "POST",
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (response.status === 201 || response.status === 200)
    return RecurringMarkResultSchema.parse(data);
  const message =
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
      ? data.message
      : "Failed to mark transfer as recurring";
  throw new TransactionApiError(message, response.status);
}

const TransferFormOptionsSchema = z.object({
  accounts: z.array(z.object({ id: AccountIdSchema, name: z.string(), currency: z.string() })),
  tags: z.array(z.object({ id: TagIdSchema, name: z.string(), color: z.string() })),
  default_date: z.string(),
  idempotency_key: z.string(),
  text: z.record(z.string(), z.string()),
});

export type TransferFormOptions = z.infer<typeof TransferFormOptionsSchema>;
export type TransferCreatePayload = {
  from_account_id: string;
  to_account_id: string;
  date: string;
  amount: string;
  exchange_rate?: string;
  source_fee_amount?: string;
  destination_fee_amount?: string;
  tag_ids: TagId[];
  idempotency_key: string;
};

export function transferFormOptionsQueryOptions(basePath: string) {
  return queryOptions({
    queryKey: ["spa", "transfer-form-options", basePath] as const,
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`${basePath}/form_options`, { signal });
      if (!response.ok)
        throw new TransactionApiError("Failed to load transfer form", response.status);
      return TransferFormOptionsSchema.parse(await response.json());
    },
  });
}

export async function createTransfer(
  basePath: string,
  transfer: TransferCreatePayload,
): Promise<SpaTransfer> {
  const response = await apiFetch(basePath, { method: "POST", body: JSON.stringify({ transfer }) });
  const data: unknown = await response.json();
  if (response.status === 201) return SpaTransferSchema.parse(data);
  const message =
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
      ? data.message
      : "Failed to create transfer";
  throw new TransactionApiError(message, response.status);
}

export function transferExchangeRateQueryOptions(
  basePath: string,
  fromId: string,
  toId: string,
  date: string,
) {
  return queryOptions({
    queryKey: ["spa", "transfer-exchange-rate", basePath, fromId, toId, date] as const,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from_account_id: fromId, to_account_id: toId, date });
      const response = await apiFetch(`${basePath}/exchange_rate?${params}`, { signal });
      if (!response.ok) {
        throw new TransactionApiError(
          "Exchange rate unavailable for selected currencies and date",
          response.status,
        );
      }
      return z.object({ rate: z.string() }).parse(await response.json()).rate;
    },
    enabled: fromId !== "" && toId !== "" && date !== "",
    retry: false,
  });
}
