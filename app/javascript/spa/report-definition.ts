import * as z from "zod/mini";
import { PIVOT_AGGREGATIONS, PIVOT_DATE_BUCKETS } from "./pivot-chart-contract";
import {
  ReportDimensionIdSchema,
  ReportMeasureIdSchema,
  ReportRowIdSchema,
  ReportColumnIdSchema,
} from "./ids";

export const ReportDimensionSchema = z.object({
  id: ReportDimensionIdSchema,
  field: z.string(),
  dateBucket: z.optional(z.enum(PIVOT_DATE_BUCKETS)),
});
export const ReportValueSchema = z.object({
  id: ReportMeasureIdSchema,
  field: z.string(),
  aggregation: z.enum(PIVOT_AGGREGATIONS),
});
export const ReportFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(["last", "equals", "not_equals"]),
  value: z.union([z.string(), z.number()]),
  unit: z.optional(z.literal("days")),
});
export const ReportSortSchema = z.object({
  axis: z.enum(["rows", "columns"]),
  measure: z.optional(ReportMeasureIdSchema),
  dimension: z.optional(ReportDimensionIdSchema),
  direction: z.enum(["asc", "desc"]),
});
export const AggregateReportDefinitionSchema = z.object({
  version: z.literal(1),
  source: z.literal("transactions"),
  mode: z.literal("aggregate"),
  rows: z.array(ReportDimensionSchema),
  columns: z.array(ReportDimensionSchema),
  values: z.array(ReportValueSchema),
  filters: z.array(ReportFilterSchema),
  sort: z.array(ReportSortSchema),
});
export const DETAIL_FIELDS = ["date", "name", "account", "category", "amount", "currency"] as const;
export const DetailReportColumnSchema = z.object({ field: z.enum(DETAIL_FIELDS) });
export const DetailReportSortSchema = z.object({
  field: z.enum(DETAIL_FIELDS),
  direction: z.enum(["asc", "desc"]),
});
export const DetailReportDefinitionSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("transactions"),
    mode: z.literal("detail"),
    columns: z.array(DetailReportColumnSchema).check(z.minLength(1), z.maxLength(6)),
    filters: z.array(ReportFilterSchema),
    sort: z.array(DetailReportSortSchema).check(z.maxLength(6)),
  })
  .check(
    z.refine(
      (definition) =>
        new Set(definition.columns.map((column) => column.field)).size ===
          definition.columns.length &&
        new Set(definition.sort.map((sort) => sort.field)).size === definition.sort.length &&
        definition.sort.every((sort) =>
          definition.columns.some((column) => column.field === sort.field),
        ),
    ),
  );
export const ReportDefinitionSchema = z.discriminatedUnion("mode", [
  AggregateReportDefinitionSchema,
  DetailReportDefinitionSchema,
]);
export type AggregateReportDefinition = z.infer<typeof AggregateReportDefinitionSchema>;
export type DetailReportDefinition = z.infer<typeof DetailReportDefinitionSchema>;
export type DetailReportColumn = z.infer<typeof DetailReportColumnSchema>;
export type ReportDefinition = z.infer<typeof ReportDefinitionSchema>;
export type ReportDimension = z.infer<typeof ReportDimensionSchema>;
export type ReportValue = z.infer<typeof ReportValueSchema>;
export type ReportFilter = z.infer<typeof ReportFilterSchema>;
export type ReportSort = z.infer<typeof ReportSortSchema>;

export const ReportCatalogSchema = z.object({
  source: z.literal("transactions"),
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      kind: z.enum(["text", "date", "number", "currency"]),
      dimension: z.boolean(),
      detail: z.boolean(),
      aggregations: z.array(z.enum(PIVOT_AGGREGATIONS)),
      dateBuckets: z.array(z.enum(PIVOT_DATE_BUCKETS)),
      operators: z.array(z.enum(["last", "equals", "not_equals"])),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
    }),
  ),
});
export type ReportCatalog = z.infer<typeof ReportCatalogSchema>;
export type ReportField = ReportCatalog["fields"][number];

const AxisGroupSchema = z.object({
  key: ReportColumnIdSchema,
  values: z.array(z.unknown()),
  labels: z.array(z.string()),
});
const MeasureCellSchema = z.nullable(z.union([z.string(), z.number()]));
export const ReportPaginationSchema = z.object({
  limit: z.int().check(z.gte(1)),
  offset: z.int().check(z.gte(0)),
  hasNext: z.boolean(),
});
export const AggregateReportResultSchema = z.object({
  mode: z.literal("aggregate"),
  sql: z.string(),
  rows: z.array(
    z.object({
      key: ReportRowIdSchema,
      values: z.array(z.unknown()),
      labels: z.array(z.string()),
      totals: z.array(MeasureCellSchema),
    }),
  ),
  columns: z.array(AxisGroupSchema),
  cells: z.array(
    z.object({
      rowKey: ReportRowIdSchema,
      columnKey: ReportColumnIdSchema,
      values: z.array(MeasureCellSchema),
    }),
  ),
  measures: z.array(
    z.object({
      id: ReportMeasureIdSchema,
      label: z.string(),
      format: z.enum(["number", "currency"]),
      currency: z.nullable(z.string()),
    }),
  ),
  truncated: z.boolean(),
  pagination: ReportPaginationSchema,
});
export const DetailReportResultSchema = z
  .object({
    mode: z.literal("detail"),
    sql: z.string(),
    columns: z.array(
      z.object({
        field: z.string(),
        label: z.string(),
        kind: z.enum(["text", "date", "number", "currency"]),
      }),
    ),
    rows: z.array(
      z.object({
        id: ReportRowIdSchema,
        currency: z.string(),
        values: z.array(MeasureCellSchema),
      }),
    ),
    truncated: z.boolean(),
    pagination: ReportPaginationSchema,
  })
  .check(
    z.refine((result) =>
      result.rows.every(
        (row) =>
          row.values.length === result.columns.length &&
          result.columns.every(
            (column, index) =>
              column.field !== "amount" ||
              row.values[index] === null ||
              typeof row.values[index] === "string",
          ),
      ),
    ),
  );
export const StructuredReportResultSchema = z.discriminatedUnion("mode", [
  AggregateReportResultSchema,
  DetailReportResultSchema,
]);
export type AggregateReportResult = z.infer<typeof AggregateReportResultSchema>;
export type DetailReportResult = z.infer<typeof DetailReportResultSchema>;
export type StructuredReportResult = z.infer<typeof StructuredReportResultSchema>;
export type ReportBuilderText = Record<string, string>;

export function defaultReportDefinition(): AggregateReportDefinition {
  return {
    version: 1,
    source: "transactions",
    mode: "aggregate",
    rows: [{ id: ReportDimensionIdSchema.parse("category"), field: "category" }],
    columns: [{ id: ReportDimensionIdSchema.parse("month"), field: "date", dateBucket: "month" }],
    values: [{ id: ReportMeasureIdSchema.parse("total"), field: "amount", aggregation: "sum" }],
    filters: [{ field: "date", operator: "last", value: 90, unit: "days" }],
    sort: [
      { axis: "rows", measure: ReportMeasureIdSchema.parse("total"), direction: "desc" },
      { axis: "columns", dimension: ReportDimensionIdSchema.parse("month"), direction: "asc" },
    ],
  };
}

export function defaultDetailReportDefinition(): DetailReportDefinition {
  return {
    version: 1,
    source: "transactions",
    mode: "detail",
    columns: DETAIL_FIELDS.map((field) => ({ field })),
    filters: [{ field: "date", operator: "last", value: 90, unit: "days" }],
    sort: [{ field: "date", direction: "desc" }],
  };
}
