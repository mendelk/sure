import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";
import { MerchantIdSchema } from "../ids";
import { readCsrfToken } from "./transactions";

const MerchantRowSchema = z.object({
  id: z.pipe(z.string(), MerchantIdSchema),
  name: z.string(),
  type: z.string(),
  color: z.nullable(z.string()),
  logo_url: z.nullable(z.string()),
  source: z.nullable(z.string()),
  transactions_href: z.string(),
  edit_href: z.string(),
  destroy_href: z.string(),
});

const MerchantGroupSchema = z.object({
  items: z.array(MerchantRowSchema),
  page: z.number(),
  per_page: z.number(),
  total_pages: z.number(),
  total_count: z.number(),
  item_count: z.number(),
});

const MerchantFormSchema = z.object({
  id: z.nullable(z.pipe(z.string(), MerchantIdSchema)),
  name: z.nullable(z.string()),
  color: z.nullable(z.string()),
  website_url: z.nullable(z.string()),
  type: z.string(),
});

export const MerchantsIndexSchema = z.object({
  family_merchants: MerchantGroupSchema,
  provider_merchants: MerchantGroupSchema,
  unlinked: z.array(MerchantRowSchema),
  counts: z.object({
    family: z.number(),
    provider: z.number(),
    unlinked: z.number(),
  }),
  enhance: z.object({
    eligible_count: z.number(),
    llm_available: z.boolean(),
  }),
  colors: z.array(z.string()),
});

export type MerchantsIndex = z.infer<typeof MerchantsIndexSchema>;
export type MerchantRow = z.infer<typeof MerchantRowSchema>;
export type MerchantFormDefaults = z.infer<typeof MerchantFormSchema>;

export const MerchantsEditSchema = z.object({
  merchant: z.object({
    id: z.pipe(z.string(), MerchantIdSchema),
    name: z.string(),
    type: z.string(),
    color: z.nullable(z.string()),
    logo_url: z.nullable(z.string()),
    source: z.nullable(z.string()),
    website_url: z.nullable(z.string()),
    transactions_href: z.string(),
    edit_href: z.string(),
    destroy_href: z.string(),
  }),
  colors: z.array(z.string()),
});

export type MerchantsEdit = z.infer<typeof MerchantsEditSchema>;

export const MerchantsNewSchema = z.object({
  merchant: MerchantFormSchema,
  colors: z.array(z.string()),
});

export type MerchantsNew = z.infer<typeof MerchantsNewSchema>;

export class MerchantsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "MerchantsApiError";
  }
}

export type MerchantsSearch = {
  family_search?: string;
  provider_search?: string;
  family_page?: number;
  provider_page?: number;
  per_page?: number;
};

function merchantsQueryString(search: MerchantsSearch): string {
  const params = new URLSearchParams();
  if (search.family_search !== undefined && search.family_search !== "")
    params.set("family_search", search.family_search);
  if (search.provider_search !== undefined && search.provider_search !== "")
    params.set("provider_search", search.provider_search);
  if (search.family_page !== undefined && search.family_page > 1)
    params.set("family_page", String(search.family_page));
  if (search.provider_page !== undefined && search.provider_page > 1)
    params.set("provider_page", String(search.provider_page));
  if (search.per_page !== undefined) params.set("per_page", String(search.per_page));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function merchantsIndexQueryOptions(path: string, search: MerchantsSearch) {
  const url = `${path}${merchantsQueryString(search)}`;
  return queryOptions({
    queryKey: ["spa", "merchants-index", url] as const,
    queryFn: async ({ signal }): Promise<MerchantsIndex> => {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok)
        throw new MerchantsApiError("Merchant list is unavailable.", response.status);
      const payload: unknown = await response.json();
      return MerchantsIndexSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

export function merchantFormQueryOptions(url: string, kind: "new" | "edit") {
  const isNew = kind === "new";
  return queryOptions({
    queryKey: ["spa", "merchant-form", url] as const,
    queryFn: async ({ signal }): Promise<MerchantsNew | MerchantsEdit> => {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok)
        throw new MerchantsApiError("Merchant form is unavailable.", response.status);
      const payload: unknown = await response.json();
      if (isNew) return MerchantsNewSchema.parse(payload);
      return MerchantsEditSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

const ErrorPayloadSchema = z.object({
  errors: z.optional(z.array(z.string())),
  message: z.optional(z.string()),
});

function extractErrors(payload: unknown, fallback: string): string[] {
  const parsed = ErrorPayloadSchema.safeParse(payload);
  if (!parsed.success) return [fallback];
  if (parsed.data.errors !== undefined && parsed.data.errors.length > 0) return parsed.data.errors;
  if (parsed.data.message !== undefined && parsed.data.message.length > 0)
    return [parsed.data.message];
  return [fallback];
}

async function requestMutatingJson(url: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  const errors = extractErrors(payload, `Request failed (${response.status})`);
  throw new MerchantsApiError(errors[0] ?? "Request failed", response.status, errors);
}

export type MerchantWriteInput = {
  name: string;
  color?: string;
  website_url?: string | null;
};

function merchantWriteBody(
  root: "family_merchant" | "provider_merchant",
  input: MerchantWriteInput,
) {
  const attrs: Record<string, string | null> = { name: input.name };
  if (input.color !== undefined) attrs.color = input.color;
  if (input.website_url !== undefined) attrs.website_url = input.website_url;
  return { [root]: attrs };
}

// Mirrors the ERB form's `family_merchant[...]` params so one controller path
// serves both. Provider rows submit under `provider_merchant[...]` (name-only
// edits convert; website-only edits patch the provider row in place).
// Create keeps the legacy `{id, name, html}` document the ERB inline-create
// consumes (`merchant.html`); the SPA modal refreshes from the index after.
export async function createMerchantRecord(
  path: string,
  input: MerchantWriteInput,
): Promise<{ id: string; name: string }> {
  const payload = await requestMutatingJson(
    path,
    "POST",
    merchantWriteBody("family_merchant", input),
  );
  return z.object({ id: z.string(), name: z.string() }).parse(payload);
}

export async function updateMerchantRecord(
  destroyHref: string,
  root: "family_merchant" | "provider_merchant",
  input: MerchantWriteInput,
): Promise<MerchantRow> {
  const payload = await requestMutatingJson(destroyHref, "PATCH", merchantWriteBody(root, input));
  return MerchantRowSchema.parse(payload);
}

export async function destroyMerchantRecord(
  destroyHref: string,
): Promise<{ ok: boolean; unlinked: boolean }> {
  const payload = await requestMutatingJson(destroyHref, "DELETE");
  return z.object({ ok: z.boolean(), unlinked: z.boolean() }).parse(payload);
}

export async function enhanceProviderMerchants(path: string): Promise<{ ok: boolean }> {
  const payload = await requestMutatingJson(path, "POST");
  return z.object({ ok: z.boolean() }).parse(payload);
}

export const MergeCandidatesSchema = z.object({
  merchants: z.array(MerchantRowSchema),
  colors: z.array(z.string()),
});

export type MergeCandidates = z.infer<typeof MergeCandidatesSchema>;

export function mergeCandidatesQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "merchants-merge", path] as const,
    queryFn: async ({ signal }): Promise<MergeCandidates> => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok)
        throw new MerchantsApiError("Merge candidates are unavailable.", response.status);
      const payload: unknown = await response.json();
      return MergeCandidatesSchema.parse(payload);
    },
    staleTime: 10_000,
  });
}

export async function performMerchantMerge(
  path: string,
  targetId: string,
  sourceIds: string[],
): Promise<{ ok: boolean; merged_count: number }> {
  const payload = await requestMutatingJson(path, "POST", {
    target_id: targetId,
    source_ids: sourceIds,
  });
  return z.object({ ok: z.boolean(), merged_count: z.number() }).parse(payload);
}

export function invalidateMerchantQueries(queryClient: {
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<void>;
}): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["spa", "merchants-index"] }),
    queryClient.invalidateQueries({ queryKey: ["spa", "merchant-form"] }),
    queryClient.invalidateQueries({ queryKey: ["spa", "merchants-merge"] }),
  ]);
}
