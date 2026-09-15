import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod/mini";
import {
  GetApiSpaTransactions200Response,
  GetApiSpaTransactions401Response,
  GetApiSpaTransactions422Response,
  GetApiSpaTransactionsQueryParams,
} from "./generated";

export type TransactionCollection = z.infer<
  typeof GetApiSpaTransactions200Response
>;
export type TransactionQuery = z.input<typeof GetApiSpaTransactionsQueryParams>;
export type SpaTransaction = TransactionCollection["transactions"][number];

export class TransactionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TransactionApiError";
  }
}

export function transactionsQueryOptions(
  path: string,
  input: TransactionQuery,
) {
  return queryOptions({
    queryKey: ["spa", "transactions", path, input] as const,
    queryFn: ({ signal }) => requestTransactions(path, input, signal),
    retry: (failureCount, error) =>
      !(error instanceof TransactionApiError && error.status < 500) &&
      failureCount < 2,
  });
}

async function requestTransactions(
  path: string,
  input: TransactionQuery,
  signal?: AbortSignal,
): Promise<TransactionCollection> {
  const query = GetApiSpaTransactionsQueryParams.parse(input);
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      search.set(key, value.join(","));
    } else if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const response = await fetch(
    search.size > 0 ? `${path}?${search.toString()}` : path,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    },
  );
  const payload: unknown = await response.json();

  if (response.status === 200) {
    return GetApiSpaTransactions200Response.parse(payload);
  }

  if (response.status === 401) {
    const error = GetApiSpaTransactions401Response.parse(payload);
    throw new TransactionApiError(
      error.message ?? "Your session has expired",
      response.status,
    );
  }

  if (response.status === 422) {
    const error = GetApiSpaTransactions422Response.parse(payload);
    throw new TransactionApiError(
      error.message ?? "Transaction filters are invalid",
      response.status,
    );
  }

  throw new TransactionApiError(
    `Transaction request failed with status ${response.status}`,
    response.status,
  );
}
