import { queryOptions, skipToken } from "@tanstack/react-query";
import * as z from "zod/mini";
import { AccountPermissionsSchema } from "./accounts";
import { ReportPaginationSchema } from "../report-definition";
import {
  AccountIdSchema,
  CategoryIdSchema,
  EntryIdSchema,
  MerchantIdSchema,
  RecurringTransactionIdSchema,
  TagIdSchema,
  TransactionIdSchema,
  type AccountId,
  type CategoryId,
  type MerchantId,
  type TagId,
  type TransactionId,
  type TransferId,
} from "../ids";
import {
  PIVOT_AGGREGATIONS,
  PivotFieldMetadataSchema,
  aggregationsForFieldKind,
  inferPivotFieldKindFromValues,
  type PivotChartConfig,
  type PivotFieldMetadata,
} from "../pivot-chart-contract";
import {
  GetApiV1Transactions200Response,
  GetApiV1TransactionsId200Response,
  GetApiV1TransactionsIdParams,
  GetApiV1TransactionsQueryParams,
  PatchApiV1TransactionsIdBody,
  PatchApiV1TransactionsIdParams,
  GetApiV1TransactionsTransactionIdTransferMatchCandidates200Response,
  GetApiV1TransactionsTransactionIdTransferMatchCandidatesParams,
  PostApiV1TransactionsTransactionIdTransferMatchBody,
  PostApiV1TransactionsTransactionIdTransferMatchParams,
  PatchApiV1TransfersIdBody,
  PatchApiV1TransfersIdParams,
} from "./generated";

export type TransactionCollection = z.infer<typeof GetApiV1Transactions200Response>;
export type TransactionQuery = Omit<
  z.infer<typeof GetApiV1TransactionsQueryParams>,
  keyof z.$brand
>;
export type SpaTransaction = TransactionCollection["transactions"][number];
export type TransactionUpdateInput = z.infer<typeof PatchApiV1TransactionsIdBody>["transaction"];
export type TransactionCreateInput = {
  account_id: AccountId;
  amount: string;
  currency: string;
  date: string;
  idempotency_key: string;
  name: string;
  nature: "inflow" | "outflow";
  notes?: string;
  category_id?: CategoryId;
  merchant_id?: MerchantId;
  tag_ids: TagId[];
  exchange_rate?: string;
};
export type SpaTransactionDetail = z.infer<typeof GetApiV1TransactionsId200Response>;
export type TransferMatchCandidates = z.infer<
  typeof GetApiV1TransactionsTransactionIdTransferMatchCandidates200Response
>;
export type TransferMatchInput = z.infer<
  typeof PostApiV1TransactionsTransactionIdTransferMatchBody
>["transfer_match"];
export type TransferUpdateInput = z.infer<typeof PatchApiV1TransfersIdBody>["transfer"];

export class TransactionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = "TransactionApiError";
  }
}

export function transactionsQueryOptions(path: string, input: TransactionQuery) {
  return queryOptions({
    queryKey: ["spa", "transactions", path, input] as const,
    queryFn: ({ signal }) => requestTransactions(path, input, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

async function requestTransactions(
  path: string,
  input: TransactionQuery,
  signal?: AbortSignal,
): Promise<TransactionCollection> {
  const query = GetApiV1TransactionsQueryParams.parse(input);
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) search.set(key, value.join(","));
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      search.set(key, String(value));
  }

  const response = await fetch(search.size > 0 ? `${path}?${search.toString()}` : path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json();

  if (response.status === 200) return GetApiV1Transactions200Response.parse(payload);
  if (response.status === 401)
    throw new TransactionApiError("Your session has expired", response.status);
  if (response.status === 422)
    throw new TransactionApiError("Transaction filters are invalid", response.status);

  throw new TransactionApiError(
    `Transaction request failed with status ${response.status}`,
    response.status,
  );
}

export function transactionDetailQueryOptions(basePath: string, id?: TransactionId) {
  return queryOptions({
    queryKey: ["spa", "transaction", basePath, id] as const,
    queryFn: id ? ({ signal }) => requestTransactionDetail(basePath, id, signal) : skipToken,
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

export const SureqlResultSchema = z.object({
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  row_count: z.number(),
  truncated: z.boolean(),
  html: z.optional(z.nullable(z.string())),
  fields: z.optional(z.array(PivotFieldMetadataSchema)),
  pagination: z.optional(z.nullable(ReportPaginationSchema)),
});

export type SureqlResult = z.infer<typeof SureqlResultSchema>;

export function pivotFieldsForResult(result: SureqlResult): PivotFieldMetadata[] {
  if (result.fields !== undefined && result.fields.length > 0) return result.fields;
  const columns =
    result.columns.length > 0
      ? result.columns
      : result.rows.length > 0
        ? Object.keys(result.rows[0])
        : [];
  return columns.map((name) => {
    const kind = inferPivotFieldKindFromValues(result.rows.map((row) => row[name]));
    return {
      name,
      kind,
      capabilities: {
        category: true,
        series: kind !== "boolean",
        measure: true,
        aggregations: aggregationsForFieldKind(kind),
      },
    };
  });
}

export const PivotResultSchema = z.object({
  sql: z.string(),
  categories: z.array(z.unknown()),
  series: z.array(z.unknown()),
  measures: z.array(
    z.object({
      field: z.optional(z.string()),
      aggregation: z.enum(PIVOT_AGGREGATIONS),
      label: z.optional(z.string()),
    }),
  ),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  row_count: z.number(),
  truncated: z.boolean(),
  fields: z.array(PivotFieldMetadataSchema),
});

export type PivotResult = z.infer<typeof PivotResultSchema>;

export async function executeSureqlPivot(
  endpoint: string,
  source: string,
  pivot: PivotChartConfig,
  options?: { signal?: AbortSignal },
): Promise<PivotResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({ source, pivot }),
    signal: options?.signal,
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return PivotResultSchema.parse(data);
}

export async function executeSureqlQuery(
  endpoint: string,
  source: string,
  options?: { signal?: AbortSignal; pagination?: { limit: number; offset: number } },
): Promise<SureqlResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    body: JSON.stringify({
      source,
      ...(options?.pagination ? { pagination: options.pagination } : {}),
    }),
    signal: options?.signal,
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return SureqlResultSchema.parse(data);
}

export function readCsrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

function extractApiError(payload: unknown, fallback: string): string[] {
  if (typeof payload !== "object" || payload === null) return [fallback];
  const record: Record<string, unknown> = { ...payload };
  if (typeof record.message === "string" && record.message.length > 0) return [record.message];
  if (Array.isArray(record.errors) && record.errors.length > 0)
    return record.errors.filter((item): item is string => typeof item === "string");
  return [fallback];
}
async function requestJson(url: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    body: body === undefined ? null : JSON.stringify(body),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;

  const errors = extractApiError(payload, `Request failed with status ${response.status}`);
  throw new TransactionApiError(errors[0] ?? "Request failed", response.status, errors);
}
export async function updateTransaction(
  basePath: string,
  id: TransactionId,
  input: NonNullable<TransactionUpdateInput>,
): Promise<SpaTransactionDetail> {
  const { id: transactionId } = PatchApiV1TransactionsIdParams.parse({ id });
  PatchApiV1TransactionsIdBody.parse({ transaction: input });
  const payload = await requestJson(`${basePath}/${transactionId}`, "PATCH", {
    transaction: input,
  });
  return GetApiV1TransactionsId200Response.parse(payload);
}

const MarkRecurringSchema = z.object({
  id: z.pipe(z.uuid(), TransactionIdSchema),
  message: z.string(),
});

export async function markTransactionRecurring(
  basePath: string,
  id: TransactionId,
): Promise<z.infer<typeof MarkRecurringSchema>> {
  const payload = await requestJson(`${basePath}/${id}/mark_as_recurring`, "POST");
  return MarkRecurringSchema.parse(payload);
}

export async function deleteTransaction(basePath: string, id: TransactionId): Promise<void> {
  await requestJson(`${basePath}/${id}`, "DELETE");
}

export async function unlockEntry(basePath: string, id: TransactionId): Promise<void> {
  await requestJson(`${basePath}/${id}/unlock`, "POST");
}

export async function mergeDuplicate(basePath: string, id: TransactionId): Promise<void> {
  await requestJson(`${basePath}/${id}/merge_duplicate`, "POST");
}

export async function dismissDuplicate(basePath: string, id: TransactionId): Promise<void> {
  await requestJson(`${basePath}/${id}/dismiss_duplicate`, "POST");
}
const TransactionCreatedSchema = z.object({
  id: z.pipe(z.uuid(), TransactionIdSchema),
  entry_id: z.pipe(z.uuid(), EntryIdSchema),
  account_id: z.pipe(z.uuid(), AccountIdSchema),
});

export async function createTransaction(
  path: string,
  input: TransactionCreateInput,
  signal?: AbortSignal,
): Promise<z.infer<typeof TransactionCreatedSchema>> {
  const { category_id, merchant_id, tag_ids, exchange_rate, ...entry } = input;
  const response = await fetch(path, {
    body: JSON.stringify({
      entry: {
        ...entry,
        entryable_type: "Transaction",
        entryable_attributes: { category_id, merchant_id, tag_ids, exchange_rate },
      },
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
    },
    method: "POST",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 200 || response.status === 201)
    return TransactionCreatedSchema.parse(payload);

  const fallback = `Request failed with status ${response.status}`;
  const errors = extractApiError(payload, fallback);
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    errors[0] === fallback
  )
    errors[0] = payload.error;
  throw new TransactionApiError(errors[0] ?? fallback, response.status, errors);
}

export async function updateTransferStatus(
  transfersPath: string,
  transferId: TransferId,
  input: NonNullable<TransferUpdateInput>,
): Promise<void> {
  const { id } = PatchApiV1TransfersIdParams.parse({ id: transferId });
  PatchApiV1TransfersIdBody.parse({ transfer: input });
  await requestJson(`${transfersPath}/${id}`, "PATCH", { transfer: input });
}

export function transferMatchCandidatesQueryOptions(
  basePath: string,
  transactionId: TransactionId,
) {
  return queryOptions({
    queryKey: ["spa", "transfer-match-candidates", basePath, transactionId] as const,
    queryFn: ({ signal }) => requestCandidates(basePath, transactionId, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

async function requestCandidates(
  basePath: string,
  transactionId: TransactionId,
  signal?: AbortSignal,
): Promise<TransferMatchCandidates> {
  const params = GetApiV1TransactionsTransactionIdTransferMatchCandidatesParams.parse({
    transaction_id: transactionId,
  });
  const response = await fetch(`${basePath}/${params.transaction_id}/transfer_match_candidates`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json();

  if (response.status === 200)
    return GetApiV1TransactionsTransactionIdTransferMatchCandidates200Response.parse(payload);
  if (response.status === 401)
    throw new TransactionApiError("Your session has expired", response.status);
  if (response.status === 404)
    throw new TransactionApiError("Transaction not found", response.status);

  throw new TransactionApiError(
    `Transfer match candidates request failed with status ${response.status}`,
    response.status,
  );
}

export async function createTransferMatch(
  basePath: string,
  transactionId: TransactionId,
  input: NonNullable<TransferMatchInput>,
): Promise<void> {
  const params = PostApiV1TransactionsTransactionIdTransferMatchParams.parse({
    transaction_id: transactionId,
  });
  PostApiV1TransactionsTransactionIdTransferMatchBody.parse({ transfer_match: input });
  await requestJson(`${basePath}/${params.transaction_id}/transfer_match`, "POST", {
    transfer_match: input,
  });
}

export function bulkUpdatePermissionsQueryOptions(path: string, entryIds: string[]) {
  return queryOptions({
    queryKey: ["spa", "bulk-permissions", path, entryIds] as const,
    enabled: entryIds.length > 0,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      for (const id of entryIds) params.append("bulk_update[entry_ids][]", id);
      const response = await fetch(`${path}/new.json?${params.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok)
        throw new TransactionApiError("Could not load transaction permissions", response.status);
      const payload: unknown = await response.json();
      return z.object({ permissions: AccountPermissionsSchema }).parse(payload).permissions;
    },
  });
}

export type ReferenceOption<TId extends string> = {
  id: TId;
  name: string;
  color?: string;
  icon?: string;
  logoUrl?: string;
  parentName?: string;
  accountType?: string;
  permissions?: z.infer<typeof AccountPermissionsSchema>;
};

export function recentCategoriesQueryOptions(categoriesPath: string) {
  return queryOptions({
    queryKey: ["spa", "reference", "recent-categories", categoriesPath] as const,
    queryFn: ({ signal }) =>
      requestReferenceList(
        `${categoriesPath}?per_page=100&recent=true`,
        "categories",
        CategoryIdSchema,
        signal,
      ),
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function referenceDataQueryOptions(
  categoriesPath: string,
  merchantsPath: string,
  tagsPath: string,
  accountsPath?: string,
) {
  return queryOptions({
    queryKey: ["spa", "reference", categoriesPath, merchantsPath, tagsPath, accountsPath] as const,
    queryFn: async ({ signal }) => {
      const [categories, merchants, tags, accounts] = await Promise.all([
        requestReferenceList(
          `${categoriesPath}?per_page=100`,
          "categories",
          CategoryIdSchema,
          signal,
        ),
        requestReferenceList(merchantsPath, null, MerchantIdSchema, signal),
        requestReferenceList(tagsPath, null, TagIdSchema, signal),
        accountsPath === undefined
          ? Promise.resolve([])
          : requestReferenceList(
              `${accountsPath}?per_page=100`,
              "accounts",
              AccountIdSchema,
              signal,
            ),
      ]);
      return { accounts, categories, merchants, tags };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export async function createCategory(
  categoriesPath: string,
  name: string,
): Promise<ReferenceOption<CategoryId>> {
  const payload = await requestJson(categoriesPath, "POST", {
    category: {
      name,
      color: "#6471eb",
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: CategoryIdSchema.parse(record.id),
      name: typeof record.name === "string" ? record.name : name,
      color: typeof record.color === "string" ? record.color : "#6471eb",
      icon: typeof record.icon === "string" ? record.icon : "shapes",
    };
  }
  throw new TransactionApiError("Failed to create category", 500);
}

export async function createMerchant(
  merchantsPath: string,
  name: string,
): Promise<ReferenceOption<MerchantId>> {
  const payload = await requestJson(merchantsPath, "POST", {
    merchant: {
      name,
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: MerchantIdSchema.parse(record.id),
      name: typeof record.name === "string" ? record.name : name,
      logoUrl: typeof record.logo_url === "string" ? record.logo_url : undefined,
    };
  }
  throw new TransactionApiError("Failed to create merchant", 500);
}
export async function createTag(tagsPath: string, name: string): Promise<ReferenceOption<TagId>> {
  const payload = await requestJson(tagsPath, "POST", {
    tag: {
      name,
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: TagIdSchema.parse(record.id),
      name: typeof record.name === "string" ? record.name : name,
      color: typeof record.color === "string" ? record.color : undefined,
    };
  }
  throw new TransactionApiError("Failed to create tag", 500);
}

function parseReferenceList<TId extends string>(
  list: unknown[],
  idSchema: z.ZodMiniType<TId>,
): ReferenceOption<TId>[] {
  return list
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string" &&
        item.id.length > 0,
    )
    .map((item) => {
      const parent: unknown = item.parent;
      const parentName =
        typeof parent === "object" &&
        parent !== null &&
        "name" in parent &&
        typeof parent.name === "string"
          ? parent.name
          : undefined;
      return {
        id: idSchema.parse(item.id),
        name: typeof item.name === "string" ? item.name : "",
        color: typeof item.color === "string" ? item.color : undefined,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        logoUrl:
          typeof item.logo_url === "string"
            ? item.logo_url
            : typeof item.logoUrl === "string"
              ? item.logoUrl
              : undefined,
        parentName,
        accountType: typeof item.account_type === "string" ? item.account_type : undefined,
        permissions:
          item.permissions === undefined
            ? undefined
            : AccountPermissionsSchema.parse(item.permissions),
      };
    })
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

async function requestReferenceList<TId extends string>(
  path: string,
  wrapperKey: string | null,
  idSchema: z.ZodMiniType<TId>,
  signal?: AbortSignal,
): Promise<ReferenceOption<TId>[]> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new TransactionApiError("Failed to load reference data", response.status);
  const payload: unknown = await response.json();
  let list: unknown = payload;
  if (payload !== null && typeof payload === "object" && wrapperKey !== null) {
    const record: Record<string, unknown> = { ...payload };
    list = record[wrapperKey];
  }
  return Array.isArray(list) ? parseReferenceList(list, idSchema) : [];
}

async function requestTransactionDetail(
  basePath: string,
  id: TransactionId,
  signal?: AbortSignal,
): Promise<SpaTransactionDetail> {
  const { id: transactionId } = GetApiV1TransactionsIdParams.parse({ id });
  const response = await fetch(`${basePath}/${transactionId}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json();

  if (response.status === 200) return GetApiV1TransactionsId200Response.parse(payload);
  if (response.status === 401)
    throw new TransactionApiError("Your session has expired", response.status);
  if (response.status === 404)
    throw new TransactionApiError("Transaction not found", response.status);

  throw new TransactionApiError(
    `Transaction request failed with status ${response.status}`,
    response.status,
  );
}

export const UpcomingRecurringTransactionSchema = z.object({
  id: RecurringTransactionIdSchema,
  amount: z.string(),
  amount_cents: z.number(),
  currency: z.string(),
  expected_day_of_month: z.nullable(z.number()),
  last_occurrence_date: z.string(),
  next_expected_date: z.nullable(z.string()),
  status: z.string(),
  occurrence_count: z.number(),
  name: z.optional(z.nullable(z.string())),
  manual: z.boolean(),
  system_managed_kind: z.optional(z.nullable(z.string())),
  expected_amount_min: z.optional(z.nullable(z.string())),
  expected_amount_min_cents: z.optional(z.nullable(z.number())),
  expected_amount_max: z.optional(z.nullable(z.string())),
  expected_amount_max_cents: z.optional(z.nullable(z.number())),
  expected_amount_avg: z.optional(z.nullable(z.string())),
  expected_amount_avg_cents: z.optional(z.nullable(z.number())),
  transfer: z.optional(z.nullable(z.boolean())),
  account: z.optional(
    z.nullable(
      z.object({
        id: AccountIdSchema,
        name: z.string(),
        account_type: z.optional(z.nullable(z.string())),
      }),
    ),
  ),
  destination_account: z.optional(
    z.nullable(
      z.object({
        id: AccountIdSchema,
        name: z.string(),
        account_type: z.optional(z.nullable(z.string())),
      }),
    ),
  ),
  merchant: z.optional(
    z.nullable(
      z.object({
        id: MerchantIdSchema,
        name: z.string(),
        logo_url: z.optional(z.nullable(z.string())),
      }),
    ),
  ),
});

export const UpcomingRecurringCollectionSchema = z.object({
  recurring_transactions: z.array(UpcomingRecurringTransactionSchema),
  pagination: z.object({
    page: z.number(),
    per_page: z.number(),
    total_count: z.number(),
    total_pages: z.number(),
  }),
});

export type UpcomingRecurringTransaction = z.infer<typeof UpcomingRecurringTransactionSchema>;
export type UpcomingRecurringCollection = z.infer<typeof UpcomingRecurringCollectionSchema>;

export function upcomingTransactionsQueryOptions(path: string) {
  return queryOptions({
    queryKey: ["spa", "upcoming-recurring", path] as const,
    queryFn: ({ signal }) => requestUpcomingTransactions(path, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

async function requestUpcomingTransactions(
  path: string,
  signal?: AbortSignal,
): Promise<UpcomingRecurringCollection> {
  const response = await fetch(`${path}?upcoming=true&per_page=100`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json();

  if (response.status === 200) return UpcomingRecurringCollectionSchema.parse(payload);
  if (response.status === 401)
    throw new TransactionApiError("Your session has expired", response.status);

  throw new TransactionApiError(
    `Upcoming transactions request failed with status ${response.status}`,
    response.status,
  );
}
