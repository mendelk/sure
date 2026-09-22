// Pivot-chart V1 contract: explicit category/series/measure configuration for SureQL results.
//
// Representative shapes:
// - Transactions: date (date), amount (number), name (text); monthly cash flow buckets date by month.
// - Accounts: name (text), balance (number/currency), classification (text); category spending splits one sum by classification.
// - Empty results keep typed empty categories/measures; invalid specs return validation issues instead of charts.
// - Executor: base SureQL compiles once with existing authorization; pivot groups/aggregates the full result.
// - Compatibility: count works for every kind; count_distinct/minimum/maximum work for every measured field;
//   sum/average require number/currency; date buckets require date/datetime; null groups sort first and count as groups.
import * as z from "zod/mini";

export const PIVOT_CHART_CONTRACT_VERSION = 1;

export const PIVOT_FIELD_KINDS = [
  "text",
  "number",
  "currency",
  "boolean",
  "date",
  "datetime",
  "unknown",
] as const;
export type PivotFieldKind = (typeof PIVOT_FIELD_KINDS)[number];

export const PIVOT_AGGREGATIONS = [
  "count",
  "count_distinct",
  "sum",
  "average",
  "minimum",
  "maximum",
] as const;
export type PivotAggregation = (typeof PIVOT_AGGREGATIONS)[number];

export const PIVOT_DATE_BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type PivotDateBucket = (typeof PIVOT_DATE_BUCKETS)[number];

export const PIVOT_CHART_TYPES = ["line", "grouped_bar", "stacked_bar"] as const;
export type PivotChartType = (typeof PIVOT_CHART_TYPES)[number];

export const PIVOT_SORTS = ["category_asc", "category_desc", "value_desc", "value_asc"] as const;
export type PivotSort = (typeof PIVOT_SORTS)[number];

export const PIVOT_VALUE_FORMATS = ["auto", "number", "currency", "percent"] as const;
export type PivotValueFormat = (typeof PIVOT_VALUE_FORMATS)[number];

export const MAX_PIVOT_MEASURES_WITHOUT_SERIES = 3;
export const MAX_PIVOT_MEASURES_WITH_SERIES = 1;
export const MAX_PIVOT_CATEGORY_GROUPS = 24;
export const MAX_PIVOT_SERIES_GROUPS = 12;

const NonEmptyFieldNameSchema = z.string();

export const PivotFieldMetadataSchema = z.object({
  name: NonEmptyFieldNameSchema,
  kind: z.enum(PIVOT_FIELD_KINDS),
  nullable: z.optional(z.boolean()),
  capabilities: z.object({
    category: z.boolean(),
    series: z.boolean(),
    measure: z.boolean(),
    aggregations: z.array(z.enum(PIVOT_AGGREGATIONS)),
  }),
});
export type PivotFieldMetadata = z.infer<typeof PivotFieldMetadataSchema>;

export const PivotCategorySchema = z.object({
  field: NonEmptyFieldNameSchema,
  dateBucket: z.optional(z.enum(PIVOT_DATE_BUCKETS)),
  limit: z.optional(z.number()),
});
export type PivotCategory = z.infer<typeof PivotCategorySchema>;

export const PivotSeriesSchema = z.object({
  field: NonEmptyFieldNameSchema,
  limit: z.optional(z.number()),
});
export const PivotMeasureSchema = z.object({
  field: z.optional(NonEmptyFieldNameSchema),
  aggregation: z.enum(PIVOT_AGGREGATIONS),
  label: z.optional(z.string()),
});
export type PivotMeasure = z.infer<typeof PivotMeasureSchema>;
export const PivotChartConfigSchema = z.object({
  version: z.literal(PIVOT_CHART_CONTRACT_VERSION),
  category: PivotCategorySchema,
  series: z.optional(PivotSeriesSchema),
  measures: z.array(PivotMeasureSchema),
  chartType: z.enum(PIVOT_CHART_TYPES),
  sort: z.enum(PIVOT_SORTS),
  valueFormat: z.optional(z.enum(PIVOT_VALUE_FORMATS)),
});
export type PivotChartConfig = z.infer<typeof PivotChartConfigSchema>;

export interface PivotValidationIssue {
  field: string;
  message: string;
}

const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const NUMERIC_MEASURE_AGGREGATIONS: Partial<Record<PivotAggregation, true>> = {
  sum: true,
  average: true,
};
const FIELD_MEASURE_AGGREGATIONS: Partial<Record<PivotAggregation, true>> = {
  count_distinct: true,
  sum: true,
  average: true,
  minimum: true,
  maximum: true,
};

function fieldByName(
  name: string,
  fields: readonly PivotFieldMetadata[],
): PivotFieldMetadata | undefined {
  for (const field of fields) if (field.name === name) return field;
  return undefined;
}

export function inferPivotFieldKind(value: unknown): PivotFieldKind {
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "unknown";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "unknown" : "datetime";
  if (typeof value !== "string") return "unknown";

  const trimmed = value.trim();
  if (trimmed.length === 0) return "unknown";
  if (/[-/T:]/u.test(trimmed)) {
    const time = Date.parse(trimmed);
    if (!Number.isNaN(time)) return trimmed.length <= 10 ? "date" : "datetime";
  }
  const numeric = Number(trimmed.replaceAll(",", ""));
  if (trimmed.length > 0 && Number.isFinite(numeric)) return "number";
  return "text";
}

export function aggregationsForFieldKind(kind: PivotFieldKind): PivotAggregation[] {
  if (kind === "number" || kind === "currency") return [...PIVOT_AGGREGATIONS];
  return ["count", "count_distinct", "minimum", "maximum"];
}

export function inferPivotFieldKindFromValues(values: readonly unknown[]): PivotFieldKind {
  const kinds = new Set<PivotFieldKind>();
  for (const value of values.slice(0, 8)) {
    const kind = inferPivotFieldKind(value);
    if (kind !== "unknown") kinds.add(kind);
    if (kinds.size > 1) return "unknown";
  }
  return kinds.size === 1 ? [...kinds][0] : "unknown";
}
export function defaultPivotChartConfig(
  fields: readonly PivotFieldMetadata[],
  preferredChartType: PivotChartType = "grouped_bar",
): PivotChartConfig | undefined {
  const category = fields.find((field) => field.capabilities.category);
  if (category === undefined) return undefined;
  const measureField = fields.find((field) => field.capabilities.measure);
  if (measureField === undefined) return undefined;

  return {
    version: PIVOT_CHART_CONTRACT_VERSION,
    category: { field: category.name },
    measures: [
      {
        field: measureField.name,
        aggregation:
          measureField.kind === "number" || measureField.kind === "currency" ? "sum" : "count",
      },
    ],
    chartType: preferredChartType,
    sort: category.kind === "date" || category.kind === "datetime" ? "category_asc" : "value_desc",
    valueFormat: "auto",
  };
}

export function validatePivotChartConfig(
  config: PivotChartConfig,
  fields: readonly PivotFieldMetadata[],
): PivotValidationIssue[] {
  const issues: PivotValidationIssue[] = [];

  // oxlint typescript/no-unnecessary-condition does not narrow z.literal(1); keep the runtime version gate.
  // eslint-disable-next-line typescript/no-unnecessary-condition -- contract version must be checked at runtime.
  if (config.version !== PIVOT_CHART_CONTRACT_VERSION)
    return [{ field: "version", message: "Unsupported pivot chart version." }];
  const measureLimit =
    config.series === undefined
      ? MAX_PIVOT_MEASURES_WITHOUT_SERIES
      : MAX_PIVOT_MEASURES_WITH_SERIES;
  if (config.measures.length > measureLimit) {
    issues.push({
      field: "measures",
      message:
        config.series === undefined
          ? `Choose up to ${MAX_PIVOT_MEASURES_WITHOUT_SERIES} measures without a series.`
          : "Choose one measure when a series is selected.",
    });
  }

  const categoryField = fieldByName(config.category.field, fields);
  if (!FIELD_NAME_PATTERN.test(config.category.field) || categoryField === undefined)
    issues.push({ field: "category.field", message: "Choose a category from the query result." });
  else if (!categoryField.capabilities.category)
    issues.push({ field: "category.field", message: "This field cannot group chart categories." });
  if (
    categoryField?.kind !== "date" &&
    categoryField?.kind !== "datetime" &&
    config.category.dateBucket !== undefined
  )
    issues.push({ field: "category.dateBucket", message: "Date buckets need a date field." });
  if (
    config.category.limit !== undefined &&
    (!Number.isInteger(config.category.limit) ||
      config.category.limit < 1 ||
      config.category.limit > MAX_PIVOT_CATEGORY_GROUPS)
  ) {
    issues.push({
      field: "category.limit",
      message: `Category limit must be 1-${MAX_PIVOT_CATEGORY_GROUPS}.`,
    });
  }

  if (config.series !== undefined) {
    const seriesField = fieldByName(config.series.field, fields);
    if (!FIELD_NAME_PATTERN.test(config.series.field) || seriesField === undefined)
      issues.push({ field: "series.field", message: "Choose a series from the query result." });
    else if (!seriesField.capabilities.series)
      issues.push({ field: "series.field", message: "This field cannot split chart series." });
    if (config.series.field === config.category.field)
      issues.push({ field: "series.field", message: "Series must differ from category." });
    if (
      config.series.limit !== undefined &&
      (!Number.isInteger(config.series.limit) ||
        config.series.limit < 1 ||
        config.series.limit > MAX_PIVOT_SERIES_GROUPS)
    ) {
      issues.push({
        field: "series.limit",
        message: `Series limit must be 1-${MAX_PIVOT_SERIES_GROUPS}.`,
      });
    }
  }

  for (const [index, measure] of config.measures.entries()) {
    const path = `measures.${index}`;
    if (measure.field === undefined) {
      if (measure.aggregation !== "count") {
        issues.push({
          field: `${path}.field`,
          message: `${measure.aggregation} needs a measured field; bare fields support count only.`,
        });
      }
      continue;
    }
    const measureField = fieldByName(measure.field, fields);
    if (!FIELD_NAME_PATTERN.test(measure.field) || measureField === undefined) {
      issues.push({ field: `${path}.field`, message: "Choose a measure from the query result." });
      continue;
    }
    if (!measureField.capabilities.measure) {
      issues.push({ field: `${path}.field`, message: "This field cannot be measured." });
      continue;
    }
    if (!measureField.capabilities.aggregations.includes(measure.aggregation)) {
      issues.push({
        field: `${path}.aggregation`,
        message: `${measure.aggregation} is unavailable for ${measure.field}.`,
      });
    }
    if (measure.aggregation === "count" || FIELD_MEASURE_AGGREGATIONS[measure.aggregation] !== true)
      continue;
    if (
      NUMERIC_MEASURE_AGGREGATIONS[measure.aggregation] === true &&
      measureField.kind !== "number" &&
      measureField.kind !== "currency"
    ) {
      issues.push({
        field: `${path}.aggregation`,
        message: `${measure.aggregation} needs a numeric field.`,
      });
    }
  }

  if (config.chartType === "line" && config.series === undefined && config.measures.length > 1) {
    issues.push({
      field: "chartType",
      message: "Line charts support one measure unless a series splits it.",
    });
  }
  if (config.chartType === "stacked_bar") {
    if (config.series === undefined && config.measures.length < 2) {
      issues.push({
        field: "chartType",
        message: "Stacked bars need a series or at least two measures.",
      });
    }
    if (config.sort === "category_desc" || config.sort === "category_asc") {
      const categoryKind = categoryField?.kind;
      if (categoryKind !== "date" && categoryKind !== "datetime") {
        issues.push({
          field: "sort",
          message: "Stacked bars sort by value unless the category is a date.",
        });
      }
    }
  }

  return issues;
}

export function summarizePivotChartConfig(config: PivotChartConfig): string {
  const measures = config.measures
    .map((measure) =>
      measure.field === undefined ? "count" : `${measure.aggregation}(${measure.field})`,
    )
    .join(", ");
  const series = config.series === undefined ? "" : ` by ${config.series.field}`;
  return `${config.chartType}: ${measures} grouped by ${config.category.field}${series}`;
}
