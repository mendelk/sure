import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod/mini";
import {
  GetApiV1Transactions200Response,
  GetApiV1TransactionsId200Response,
  GetApiV1TransactionsIdParams,
  GetApiV1TransactionsQueryParams,
  PatchApiV1TransactionsIdBody,
  PatchApiV1TransactionsIdParams,
  PostApiV1Transactions201Response,
  PostApiV1TransactionsBody,
  GetApiV1TransactionsTransactionIdTransferMatchCandidates200Response,
  GetApiV1TransactionsTransactionIdTransferMatchCandidatesParams,
  PostApiV1TransactionsTransactionIdTransferMatchBody,
  PostApiV1TransactionsTransactionIdTransferMatchParams,
  PatchApiV1TransfersIdBody,
  PatchApiV1TransfersIdParams,
} from "./generated";

export type TransactionCollection = z.infer<typeof GetApiV1Transactions200Response>;
export type TransactionQuery = z.input<typeof GetApiV1TransactionsQueryParams>;
export type SpaTransaction = TransactionCollection["transactions"][number];
export type TransactionUpdateInput = z.input<typeof PatchApiV1TransactionsIdBody>["transaction"];
export type TransactionCreateInput = z.input<typeof PostApiV1TransactionsBody>["transaction"];
export type SpaTransactionDetail = z.infer<typeof GetApiV1TransactionsId200Response>;
export type TransferMatchCandidates = z.infer<
  typeof GetApiV1TransactionsTransactionIdTransferMatchCandidates200Response
>;
export type TransferMatchInput = z.input<
  typeof PostApiV1TransactionsTransactionIdTransferMatchBody
>["transfer_match"];
export type TransferUpdateInput = z.input<typeof PatchApiV1TransfersIdBody>["transfer"];

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

export function transactionDetailQueryOptions(basePath: string, id: string) {
  return queryOptions({
    queryKey: ["spa", "transaction", basePath, id] as const,
    queryFn: ({ signal }) => requestTransactionDetail(basePath, id, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
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
  id: string,
  input: NonNullable<TransactionUpdateInput>,
): Promise<SpaTransactionDetail> {
  const normalizedInput = { ...input };
  if (normalizedInput.category_id === "") normalizedInput.category_id = null;
  if (normalizedInput.merchant_id === "") normalizedInput.merchant_id = null;
  const { id: transactionId } = PatchApiV1TransactionsIdParams.parse({ id });
  PatchApiV1TransactionsIdBody.parse({ transaction: normalizedInput });
  const payload = await requestJson(`${basePath}/${transactionId}`, "PATCH", {
    transaction: normalizedInput,
  });
  return GetApiV1TransactionsId200Response.parse(payload);
}
export async function createTransaction(
  basePath: string,
  input: NonNullable<TransactionCreateInput>,
): Promise<z.infer<typeof PostApiV1Transactions201Response>> {
  PostApiV1TransactionsBody.parse({ transaction: input });
  const payload = await requestJson(basePath, "POST", { transaction: input });
  return PostApiV1Transactions201Response.parse(payload);
}

export async function updateTransferStatus(
  transfersPath: string,
  transferId: string,
  input: NonNullable<TransferUpdateInput>,
): Promise<void> {
  const { id } = PatchApiV1TransfersIdParams.parse({ id: transferId });
  PatchApiV1TransfersIdBody.parse({ transfer: input });
  await requestJson(`${transfersPath}/${id}`, "PATCH", { transfer: input });
}

export function transferMatchCandidatesQueryOptions(basePath: string, transactionId: string) {
  return queryOptions({
    queryKey: ["spa", "transfer-match-candidates", basePath, transactionId] as const,
    queryFn: ({ signal }) => requestCandidates(basePath, transactionId, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) && failureCount < 2,
  });
}

async function requestCandidates(
  basePath: string,
  transactionId: string,
  signal?: AbortSignal,
): Promise<TransferMatchCandidates> {
  const params = GetApiV1TransactionsTransactionIdTransferMatchCandidatesParams.parse({
    transactionId,
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
  transactionId: string,
  input: NonNullable<TransferMatchInput>,
): Promise<void> {
  const params = PostApiV1TransactionsTransactionIdTransferMatchParams.parse({ transactionId });
  PostApiV1TransactionsTransactionIdTransferMatchBody.parse({ transfer_match: input });
  await requestJson(`${basePath}/${params.transaction_id}/transfer_match`, "POST", {
    transfer_match: input,
  });
}

export type ReferenceOption = {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  logoUrl?: string;
  parentName?: string;
};

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
        requestReferenceList(`${categoriesPath}?per_page=100`, "categories", signal),
        requestReferenceList(merchantsPath, null, signal),
        requestReferenceList(tagsPath, null, signal),
        accountsPath === undefined
          ? Promise.resolve([])
          : requestReferenceList(`${accountsPath}?per_page=100`, "accounts", signal),
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
): Promise<ReferenceOption> {
  const payload = await requestJson(categoriesPath, "POST", {
    category: {
      name,
      color: "#6471eb",
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : "",
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
): Promise<ReferenceOption> {
  const payload = await requestJson(merchantsPath, "POST", {
    merchant: {
      name,
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : "",
      name: typeof record.name === "string" ? record.name : name,
      logoUrl: typeof record.logo_url === "string" ? record.logo_url : undefined,
    };
  }
  throw new TransactionApiError("Failed to create merchant", 500);
}
export async function createTag(tagsPath: string, name: string): Promise<ReferenceOption> {
  const payload = await requestJson(tagsPath, "POST", {
    tag: {
      name,
    },
  });
  if (typeof payload === "object" && payload !== null && "id" in payload) {
    const record = payload as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : "",
      name: typeof record.name === "string" ? record.name : name,
      color: typeof record.color === "string" ? record.color : undefined,
    };
  }
  throw new TransactionApiError("Failed to create tag", 500);
}

function parseReferenceList(list: unknown[]): ReferenceOption[] {
  return list
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
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
        id: typeof item.id === "string" ? item.id : "",
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
      };
    })
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

async function requestReferenceList(
  path: string,
  wrapperKey: string | null,
  signal?: AbortSignal,
): Promise<ReferenceOption[]> {
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
  return Array.isArray(list) ? parseReferenceList(list) : [];
}

async function requestTransactionDetail(
  basePath: string,
  id: string,
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
