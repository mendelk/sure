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
    if (result.mode === "detail" && page.mode === "detail")
      for (const row of page.rows) result.rows.push(row);
    else if (result.mode === "aggregate" && page.mode === "aggregate") {
      // Each page owns complete row groups and their cells/totals. Columns
      // and measures describe the global axes, not page-local aggregates.
      for (const row of page.rows) result.rows.push(row);
      for (const cell of page.cells) result.cells.push(cell);
    } else throw new Error("Unexpected source result mode");
    result.truncated ||= page.truncated;
  }
  result.pagination = { limit: Math.max(1, result.rows.length), offset: 0, hasNext: false };
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
  const columns: DetailReportResult["columns"] = fields.map((field) => {
    const kind = metadata.get(field)?.kind;
    return {
      field,
      label: field,
      kind:
        kind === "date" || kind === "datetime"
          ? "date"
          : kind === "number" || kind === "currency"
            ? kind
            : "text",
    };
  });
  const occurrences = new Map<string, number>();
  return {
    mode: "detail",
    sql: result.sql,
    columns,
    rows: result.rows.map((row) => {
      const serialized = JSON.stringify(row);
      const occurrence = occurrences.get(serialized) ?? 0;
      occurrences.set(serialized, occurrence + 1);
      return {
        id: ReportRowIdSchema.parse(`${serialized}:${occurrence}`),
        currency: typeof row.currency === "string" ? row.currency : "",
        values: columns.map((column) => {
          const cell = scalarCell(row[column.field]);
          return column.field === "amount" && cell !== null ? String(cell) : cell;
        }),
      };
    }),
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
    columns: result.columns.map((column) => ({
      key: column.field,
      label: column.label,
      kind: column.kind,
    })),
    rows: result.rows.map((row) => ({
      id: row.id,
      currency: row.currency,
      values: Object.fromEntries(
        result.columns.map((column, index) => [column.field, row.values[index]]),
      ),
    })),
  };
}

function dimensionKey(dimension: AggregateReportDefinition["rows"][number]): string {
  return dimension.dateBucket ? `${dimension.field}:${dimension.dateBucket}` : dimension.field;
}

function dimensionLabel(dimension: AggregateReportDefinition["rows"][number]): string {
  const label = dimension.field.charAt(0).toUpperCase() + dimension.field.slice(1);
  return dimension.dateBucket ? `${label} · ${dimension.dateBucket}` : label;
}

function axisCurrency(values: unknown[], index: number): string | null {
  const currency = index < 0 ? undefined : values[index];
  return typeof currency === "string" && currency.length > 0 ? currency : null;
}

function normalizeAggregateResult(
  result: AggregateReportResult,
  definition: AggregateReportDefinition,
): SourceData {
  const rowCurrencyIndex = definition.rows.findIndex((dimension) => dimension.field === "currency");
  const columnCurrencyIndex = definition.columns.findIndex(
    (dimension) => dimension.field === "currency",
  );
  const rowCurrencies = [
    ...new Set(result.rows.map((row) => axisCurrency(row.values, rowCurrencyIndex))),
  ];
  const columns: SourceColumn[] = definition.rows.map((dimension) => ({
    key: dimensionKey(dimension),
    label: dimensionLabel(dimension),
    kind: dimension.field === "date" ? "date" : "text",
  }));
  const valueColumns: {
    key: string;
    columnKey: string;
    measureIndex: number;
    currency: string | null;
    rowCurrency: boolean;
  }[] = [];
  for (const column of result.columns) {
    for (const [measureIndex, measure] of result.measures.entries()) {
      const fixedCurrency = measure.currency ?? axisCurrency(column.values, columnCurrencyIndex);
      const splitByRowCurrency =
        measure.format === "currency" && fixedCurrency === null && rowCurrencyIndex >= 0;
      const currencies =
        splitByRowCurrency && rowCurrencies.length > 0 ? rowCurrencies : [fixedCurrency];
      for (const currency of currencies) {
        const key = JSON.stringify(["measure", measure.id, column.key, currency]);
        const groupLabel = column.labels.join(" / ");
        const label = [groupLabel, measure.label, currency].filter(Boolean).join(" · ");
        columns.push({ key, label, kind: measure.format, currency });
        valueColumns.push({
          key,
          columnKey: column.key,
          measureIndex,
          currency,
          rowCurrency: splitByRowCurrency,
        });
      }
    }
  }
  const cellsByRow = new Map<string, Map<string, (string | number | null)[]>>();
  for (const cell of result.cells) {
    let cells = cellsByRow.get(cell.rowKey);
    if (cells === undefined) {
      cells = new Map();
      cellsByRow.set(cell.rowKey, cells);
    }
    cells.set(cell.columnKey, cell.values);
  }
  const rows: SourceRow[] = result.rows.map((row) => {
    const currency = axisCurrency(row.values, rowCurrencyIndex);
    const values: SourceRow["values"] = Object.fromEntries(
      definition.rows.map((dimension, index) => [
        dimensionKey(dimension),
        row.values[index] === null || row.values[index] === undefined
          ? (row.labels[index] ?? null)
          : dimension.field === "date" || dimension.field === "currency"
            ? scalarCell(row.values[index])
            : (row.labels[index] ?? scalarCell(row.values[index])),
      ]),
    );
    const cells = cellsByRow.get(row.key);
    for (const column of valueColumns) {
      values[column.key] =
        column.rowCurrency && column.currency !== currency
          ? null
          : (cells?.get(column.columnKey)?.[column.measureIndex] ?? null);
    }
    return { id: ReportRowIdSchema.parse(row.key), currency: currency ?? "", values };
  });
  return { result, columns, rows };
}
