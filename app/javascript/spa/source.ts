import { executeStructuredReport } from "./api/reports";
import { executeSureqlQuery, pivotFieldsForResult, type SureqlResult } from "./api/transactions";
import { SourceIdSchema, ReportRowIdSchema, type SourceId, type ReportRowId } from "./ids";
import type {
  AggregateReportDefinition,
  AggregateReportResult,
  DetailReportResult,
  ReportDefinition,
  StructuredReportResult,
} from "./report-definition";

export type SourceConfiguration =
  | { kind: "structured"; definition: ReportDefinition }
  | { kind: "sureql"; query: string };

export interface Source {
  id: SourceId;
  name: string;
  configuration: SourceConfiguration;
}

export interface SourceColumn {
  key: string;
  label: string;
  kind: "text" | "date" | "number" | "currency";
  currency?: string | null;
}

export interface SourceRow {
  id: ReportRowId;
  currency: string;
  values: Partial<Record<string, string | number | null>>;
}

export interface SourceData {
  result: StructuredReportResult;
  columns: SourceColumn[];
  rows: SourceRow[];
}

export function generateSourceId(): SourceId {
  // randomUUID is unavailable on HTTP development origins. getRandomValues
  // supplies the same 128-bit UUID without requiring a secure context.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 0x40;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return SourceIdSchema.parse(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
}

const DEFAULT_SOURCE_PAGINATION = { limit: 10, offset: 0 };
const ALL_SOURCE_PAGE_SIZE = 100;

export function sourceQueryOptions(
  endpoint: string,
  source: Source,
  pagination?: { limit: number; offset: number } | "all",
) {
  const configuration = source.configuration;
  const all = pagination === "all";
  const page =
    pagination === "all"
      ? undefined
      : (pagination ??
        (configuration.kind === "structured" ? DEFAULT_SOURCE_PAGINATION : undefined));
  return {
    queryKey: all
      ? (["source", source.id, "all"] as const)
      : page
        ? (["source", source.id, page.limit, page.offset] as const)
        : (["source", source.id] as const),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SourceData> => {
      if (configuration.kind === "sureql") {
        return normalizeSureqlResult(
          all
            ? await allSureqlResults(endpoint, configuration.query, signal)
            : await executeSureqlQuery(endpoint, configuration.query, { signal, pagination: page }),
        );
      }
      const result = all
        ? await allStructuredResults(endpoint, configuration.definition, signal)
        : await executeStructuredReport(endpoint, configuration.definition, {
            signal,
            pagination: page,
          });
      if (result.mode === "detail") return normalizeDetailResult(result);
      if (configuration.definition.mode !== "aggregate")
        throw new Error("Unexpected source result mode");
      return normalizeAggregateResult(result, configuration.definition);
    },
    // Shared consumers reuse the normalized result rather than executing again
    // when another visualization mounts. Source saves explicitly clear this key.
    staleTime: Infinity,
    retry: false,
  };
}

async function allSureqlResults(
  endpoint: string,
  query: string,
  signal: AbortSignal,
): Promise<SureqlResult> {
  const result = await executeSureqlQuery(endpoint, query, {
    signal,
    pagination: { limit: ALL_SOURCE_PAGE_SIZE, offset: 0 },
  });
  let page = result;
  while (page.pagination?.hasNext === true) {
    // eslint-disable-next-line no-await-in-loop -- The next cursor and terminal page depend on the preceding response.
    page = await executeSureqlQuery(endpoint, query, {
      signal,
      pagination: {
        limit: ALL_SOURCE_PAGE_SIZE,
        offset: page.pagination.offset + page.pagination.limit,
      },
    });
    // Keep raw duplicates until the whole result is normalized, so occurrence
    // IDs remain unique even when identical rows fall on different pages.
    for (const row of page.rows) result.rows.push(row);
    result.truncated ||= page.truncated;
  }
  result.row_count = result.rows.length;
  result.pagination = { limit: Math.max(1, result.rows.length), offset: 0, hasNext: false };
  return result;
}

async function allStructuredResults(
  endpoint: string,
  definition: ReportDefinition,
  signal: AbortSignal,
): Promise<StructuredReportResult> {
  const result = await executeStructuredReport(endpoint, definition, {
    signal,
    allColumns: true,
    pagination: { limit: ALL_SOURCE_PAGE_SIZE, offset: 0 },
  });
  let page = result;
  while (page.pagination.hasNext) {
    // eslint-disable-next-line no-await-in-loop -- The next cursor and terminal page depend on the preceding response.
    page = await executeStructuredReport(endpoint, definition, {
      signal,
      allColumns: true,
      pagination: {
        limit: ALL_SOURCE_PAGE_SIZE,
        offset: page.pagination.offset + page.pagination.limit,
      },
    });
    if (result.mode === "detail" && page.mode === "detail") {
      result.result.push(...page.result);
      result.metadata.rows.push(...page.metadata.rows);
    } else if (result.mode === "aggregate" && page.mode === "aggregate") {
      // Pages contain whole row groups. Field and column metadata describe
      // the complete source, including currencies outside the current page.
      result.result.push(...page.result);
      result.metadata.rows.push(...page.metadata.rows);
    } else throw new Error("Unexpected source result mode");
    result.truncated ||= page.truncated;
  }
  result.pagination = { limit: Math.max(1, result.result.length), offset: 0, hasNext: false };
  return result;
}

function scalarCell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function normalizeSureqlResult(result: SureqlResult): SourceData {
  return normalizeDetailResult(sureqlDetailResult(result));
}

function sureqlDetailResult(result: SureqlResult): DetailReportResult {
  const metadata = new Map(pivotFieldsForResult(result).map((field) => [field.name, field]));
  const fields = result.columns.length > 0 ? result.columns : [...metadata.keys()];
  const columns: DetailReportResult["metadata"]["fields"] = fields.map((field) => {
    const kind = metadata.get(field)?.kind;
    return {
      key: field,
      field,
      label: field,
      kind:
        kind === "date" || kind === "datetime"
          ? "date"
          : kind === "number" || kind === "currency"
            ? kind
            : "text",
      role: "detail",
      currency: null,
    };
  });
  const occurrences = new Map<string, number>();
  return {
    mode: "detail",
    sql: result.sql,
    result: result.rows.map((row) =>
      Object.fromEntries(
        columns.map((column) => {
          const cell = scalarCell(row[column.key]);
          return [column.key, column.field === "amount" && cell !== null ? String(cell) : cell];
        }),
      ),
    ),
    metadata: {
      fields: columns,
      rows: result.rows.map((row) => {
        const serialized = JSON.stringify(row);
        const occurrence = occurrences.get(serialized) ?? 0;
        occurrences.set(serialized, occurrence + 1);
        return {
          id: ReportRowIdSchema.parse(`${serialized}:${occurrence}`),
          currency: typeof row.currency === "string" ? row.currency : "",
        };
      }),
    },
    truncated: result.truncated,
    // Complete chart results and bounded field queries have no server cursor.
    pagination: result.pagination ?? {
      limit: Math.max(1, result.rows.length),
      offset: 0,
      hasNext: false,
    },
  };
}

function normalizeDetailResult(result: DetailReportResult): SourceData {
  return {
    result,
    columns: result.metadata.fields.map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind,
      currency: column.currency,
    })),
    rows: result.result.map((values, index) => ({
      id: result.metadata.rows[index].id,
      currency: result.metadata.rows[index].currency,
      values,
    })),
  };
}

function dimensionKey(dimension: AggregateReportDefinition["rows"][number]): string {
  return dimension.dateBucket ? `${dimension.field}:${dimension.dateBucket}` : dimension.field;
}

function normalizeAggregateResult(
  result: AggregateReportResult,
  definition: AggregateReportDefinition,
): SourceData {
  const columns: SourceColumn[] = [];
  const bindings: { key: string; field: string; currency?: string }[] = [];
  const hasColumnGroups = definition.columns.length > 0;
  const rowCurrencies = [...new Set(result.metadata.rows.map((row) => row.currency))];
  const hasRowCurrency = definition.rows.some((dimension) => dimension.field === "currency");
  for (const field of result.metadata.fields) {
    if (field.role === "total" && hasColumnGroups) continue;
    const dimension = definition.rows.find((item) => item.id === field.key);
    // Stored chart/table field IDs remain stable presentation identities.
    // Record properties use the report's named IDs, not pivot encodings.
    const splitCurrency =
      field.role === "total" &&
      field.kind === "currency" &&
      field.currency === null &&
      hasRowCurrency;
    for (const currency of splitCurrency ? rowCurrencies : [field.currency]) {
      const key = dimension
        ? dimensionKey(dimension)
        : field.role === "total"
          ? JSON.stringify(["measure", field.key, "[]", currency])
          : field.key;
      columns.push({
        key,
        label:
          field.role === "total"
            ? [field.label, currency].filter(Boolean).join(" · ")
            : field.label,
        kind: field.kind,
        currency,
      });
      bindings.push({
        key,
        field: field.key,
        currency: splitCurrency ? (currency ?? undefined) : undefined,
      });
    }
  }
  const rows = result.result.map((record, index) => {
    const row = result.metadata.rows[index];
    return {
      id: ReportRowIdSchema.parse(row.key),
      currency: row.currency,
      values: Object.fromEntries(
        bindings.map((binding) => [
          binding.key,
          binding.currency !== undefined && binding.currency !== row.currency
            ? null
            : record[binding.field],
        ]),
      ),
    };
  });
  return { result, columns, rows };
}
