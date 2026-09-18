import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod/mini";
import {
  GetApiV1Transactions200Response,
  GetApiV1TransactionsId200Response,
  GetApiV1TransactionsIdParams,
  GetApiV1TransactionsQueryParams,
} from "./generated";

export type TransactionCollection = z.infer<typeof GetApiV1Transactions200Response>;
export type TransactionQuery = z.input<typeof GetApiV1TransactionsQueryParams>;
export type SpaTransaction = TransactionCollection["transactions"][number];
export type SpaTransactionDetail = z.infer<typeof GetApiV1TransactionsId200Response>;

export class TransactionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
