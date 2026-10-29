import { apiFetch } from "./client";
import {
  ReportCatalogSchema,
  StructuredReportResultSchema,
  type ReportDefinition,
} from "../report-definition";

export class ReportApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
    readonly kind: "http" | "invalid_response" = "http",
  ) {
    super(message);
    this.name = "ReportApiError";
  }
}

async function postReport(endpoint: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await apiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "";
    const field =
      typeof payload === "object" &&
      payload !== null &&
      "field" in payload &&
      typeof payload.field === "string"
        ? payload.field
        : undefined;
    throw new ReportApiError(message, response.status, field);
  }
  return payload;
}

export async function fetchReportCatalog(endpoint: string, options?: { signal?: AbortSignal }) {
  const payload = await postReport(endpoint, { catalog: true }, options?.signal);
  const parsed = ReportCatalogSchema.safeParse(payload);
  if (!parsed.success) throw new ReportApiError("", 200, undefined, "invalid_response");
  return parsed.data;
}

export async function executeStructuredReport(
  endpoint: string,
  report: ReportDefinition,
  options?: {
    signal?: AbortSignal;
    pagination?: { limit: number; offset: number };
    allColumns?: boolean;
  },
) {
  const payload = await postReport(
    endpoint,
    {
      report,
      ...(options?.pagination ? { pagination: options.pagination } : {}),
      ...(options?.allColumns === true ? { all_columns: true } : {}),
    },
    options?.signal,
  );
  const parsed = StructuredReportResultSchema.safeParse(payload);
  if (!parsed.success || parsed.data.mode !== report.mode)
    throw new ReportApiError("", 200, undefined, "invalid_response");
  return parsed.data;
}
