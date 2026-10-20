import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountIdSchema, EntryIdSchema } from "../ids";
import { readCsrfToken } from "./transactions";

const ValuationPageSchema = z.object({
  accounts: z.array(
    z.object({
      id: AccountIdSchema,
      name: z.string(),
      currency: z.string(),
      accountable_type: z.string(),
      linked: z.boolean(),
    }),
  ),
  account_id: z.nullable(AccountIdSchema),
  entry: z.object({
    id: z.nullable(EntryIdSchema),
    name: z.string(),
    date: z.string(),
    amount: z.string(),
    currency: z.string(),
    notes: z.nullable(z.string()),
    kind: z.enum(["reconciliation", "opening_anchor", "current_anchor"]),
    formatted_amount: z.string(),
    date_label: z.string(),
  }),
  permissions: z.object({ can_edit: z.boolean(), can_annotate: z.boolean() }),
  date_bounds: z.object({ min: z.string(), max: z.string() }),
  text: z.record(z.string(), z.string()),
});
const ConfirmationSchema = z.object({
  confirmation: z.object({
    description: z.string(),
    notice: z.string(),
    investment: z.boolean(),
    total_value: z.string(),
    holdings_value: z.nullable(z.string()),
    brokerage_cash: z.nullable(z.string()),
    brokerage_cash_negative: z.boolean(),
  }),
});
const MutationResultSchema = z.object({ entry_id: EntryIdSchema, account_id: AccountIdSchema });
const ErrorsSchema = z.object({ errors: z.array(z.string()) });

export type ValuationPage = z.infer<typeof ValuationPageSchema>;
export type ValuationConfirmation = z.infer<typeof ConfirmationSchema>["confirmation"];
export type ValuationInput = { account_id: string; date: string; amount: string };

export class ValuationApiError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "ValuationApiError";
  }
}

async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  entry?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() }),
    },
    ...(method !== "GET" && entry !== undefined ? { body: JSON.stringify({ entry }) } : {}),
    signal,
  });
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ErrorsSchema.safeParse(payload);
    throw new ValuationApiError(parsed.success ? parsed.data.errors : []);
  }
  return payload;
}

function valuationPath(entryId: string): string {
  return `/valuations/${encodeURIComponent(entryId)}`;
}

export function valuationPageQueryOptions(entryId?: string, accountId?: string) {
  const search = new URLSearchParams();
  if (accountId !== undefined) search.set("account_id", accountId);
  const path =
    entryId === undefined ? `/valuations/new.json?${search}` : `${valuationPath(entryId)}.json`;
  return queryOptions({
    queryKey: ["spa", "valuation", entryId ?? "new", accountId ?? null] as const,
    queryFn: async ({ signal }) =>
      ValuationPageSchema.parse(await request(path, "GET", undefined, signal)),
    staleTime: 0,
  });
}

export async function previewValuation(input: ValuationInput, entryId?: string) {
  const path =
    entryId === undefined
      ? "/valuations/confirm_create.json"
      : `${valuationPath(entryId)}/confirm_update.json`;
  const entry = entryId === undefined ? input : { date: input.date, amount: input.amount };
  return ConfirmationSchema.parse(await request(path, "POST", entry)).confirmation;
}

export async function saveValuation(input: ValuationInput, entryId?: string) {
  const path = entryId === undefined ? "/valuations.json" : `${valuationPath(entryId)}.json`;
  const entry = entryId === undefined ? input : { date: input.date, amount: input.amount };
  return MutationResultSchema.parse(
    await request(path, entryId === undefined ? "POST" : "PATCH", entry),
  );
}

export async function saveValuationNotes(entryId: string, notes: string) {
  return MutationResultSchema.parse(
    await request(`${valuationPath(entryId)}.json`, "PATCH", { notes }),
  );
}

export async function deleteValuation(entryId: string): Promise<void> {
  await request(`${valuationPath(entryId)}.json`, "DELETE");
}
