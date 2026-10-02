import { useMemo } from "react";
import { FormField } from "./components/form-field";
import {
  MAX_PIVOT_CATEGORY_GROUPS,
  MAX_PIVOT_SERIES_GROUPS,
  PIVOT_AGGREGATIONS,
  PIVOT_CHART_TYPES,
  PIVOT_DATE_BUCKETS,
  PIVOT_SORTS,
  PIVOT_VALUE_FORMATS,
  aggregationsForFieldKind,
  summarizePivotChartConfig,
  validatePivotChartConfig,
  type PivotAggregation,
  type PivotChartConfig,
  type PivotChartType,
  type PivotDateBucket,
  type PivotFieldMetadata,
  type PivotSort,
  type PivotValueFormat,
} from "./pivot-chart-contract";

type PivotMeasureDraft = PivotChartConfig["measures"][number];

function fieldOptions(
  fields: readonly PivotFieldMetadata[],
  capability: "category" | "series" | "measure",
): PivotFieldMetadata[] {
  return fields.filter((field) => field.capabilities[capability]);
}

function aggregationOptions(field: PivotFieldMetadata | undefined): PivotAggregation[] {
  if (field === undefined) return ["count"];
  const allowed =
    field.capabilities.aggregations.length > 0
      ? field.capabilities.aggregations
      : aggregationsForFieldKind(field.kind);
  return allowed.length > 0 ? allowed : ["count"];
}

function asDateBucket(value: string): PivotDateBucket | undefined {
  if (value === "day" || value === "week" || value === "month" || value === "quarter") return value;
  if (value === "year") return value;
  return undefined;
}

function asChartType(value: string): PivotChartType {
  if (value === "line" || value === "grouped_bar" || value === "stacked_bar") return value;
  return "grouped_bar";
}

function asSort(value: string): PivotSort {
  if (
    value === "category_asc" ||
    value === "category_desc" ||
    value === "value_desc" ||
    value === "value_asc"
  )
    return value;
  return "value_desc";
}

function asValueFormat(value: string): PivotValueFormat | undefined {
  if (value === "auto" || value === "number" || value === "currency" || value === "percent")
    return value;
  return undefined;
}

function asAggregation(value: string): PivotAggregation {
  if (
    value === "count" ||
    value === "count_distinct" ||
    value === "sum" ||
    value === "average" ||
    value === "minimum" ||
    value === "maximum"
  )
    return value;
  return "count";
}

function nextAggregationForField(
  fieldName: string,
  current: PivotAggregation,
  fields: readonly PivotFieldMetadata[],
): PivotAggregation {
  const field = fields.find((candidate) => candidate.name === fieldName);
  const allowed = aggregationOptions(field);
  if (allowed.includes(current)) return current;
  return allowed[0] ?? "count";
}

export function PivotChartConfigurator({
  fields,
  value,
  onChange,
  stale,
  missingFields,
}: {
  fields: readonly PivotFieldMetadata[];
  value: PivotChartConfig | null;
  onChange: (next: PivotChartConfig | null) => void;
  stale: boolean;
  missingFields: string[];
}) {
  const issues = useMemo(
    () => (value === null ? [] : validatePivotChartConfig(value, fields)),
    [value, fields],
  );
  const categories = fieldOptions(fields, "category");
  const seriesChoices = fieldOptions(fields, "series");
  const measureChoices = fieldOptions(fields, "measure");

  if (fields.length === 0)
    return <p className="text-sm text-secondary">Run the query preview to list chart fields.</p>;

  if (value === null)
    return <p className="text-sm text-secondary">Choose a category to start the chart.</p>;

  const categoryField = fields.find((field) => field.name === value.category.field);
  const seriesField =
    value.series === undefined
      ? undefined
      : fields.find((field) => field.name === value.series?.field);
  const dateBucketSupported = categoryField?.kind === "date" || categoryField?.kind === "datetime";

  const updateCategory = (next: string) => {
    const nextField = fields.find((field) => field.name === next);
    onChange({
      ...value,
      category: { ...value.category, field: next },
      sort:
        nextField?.kind === "date" || nextField?.kind === "datetime" ? "category_asc" : value.sort,
    });
  };

  const updateSeries = (next: string) => {
    if (next === "") {
      const { series: _removed, ...rest } = value;
      onChange({ ...rest, measures: value.measures.slice(0, 3) });
      return;
    }
    onChange({
      ...value,
      series: { field: next },
      measures: value.measures.slice(0, 1),
    });
  };

  const updateMeasureField = (index: number, next: string) => {
    const nextMeasures: PivotMeasureDraft[] = value.measures.map((candidate, candidateIndex) => {
      if (candidateIndex !== index) return candidate;
      if (next === "") {
        return {
          ...candidate,
          field: undefined,
          aggregation: "count" as const,
        };
      }
      return {
        ...candidate,
        field: next,
        aggregation: nextAggregationForField(next, candidate.aggregation, fields),
      };
    });
    onChange({ ...value, measures: nextMeasures });
  };

  const updateMeasureAggregation = (index: number, next: string) => {
    const nextMeasures: PivotMeasureDraft[] = value.measures.map((candidate, candidateIndex) => {
      if (candidateIndex !== index) return candidate;
      return { ...candidate, aggregation: asAggregation(next) };
    });
    onChange({ ...value, measures: nextMeasures });
  };

  return (
    <div className="space-y-3">
      {stale && (
        <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          Query changed since the last preview — run the query again before editing the chart.
        </p>
      )}
      {missingFields.length > 0 && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Missing from this query: {missingFields.join(", ")}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          as="select"
          id="pivot-category"
          label="Category"
          value={value.category.field}
          onChange={(event) => {
            updateCategory(event.currentTarget.value);
          }}
        >
          {categories.map((field) => (
            <option key={field.name} value={field.name}>
              {field.name} ({field.kind})
            </option>
          ))}
        </FormField>

        <FormField
          as="select"
          id="pivot-category-bucket"
          label="Date bucket"
          value={value.category.dateBucket ?? ""}
          disabled={!dateBucketSupported}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange({
              ...value,
              category: {
                ...value.category,
                ...(next === "" ? {} : { dateBucket: asDateBucket(next) }),
              },
            });
          }}
        >
          <option value="">None</option>
          {PIVOT_DATE_BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {bucket}
            </option>
          ))}
        </FormField>

        <FormField
          as="select"
          id="pivot-series"
          label="Series (optional)"
          value={value.series?.field ?? ""}
          onChange={(event) => {
            updateSeries(event.currentTarget.value);
          }}
        >
          <option value="">None</option>
          {seriesChoices
            .filter((field) => field.name !== value.category.field)
            .map((field) => (
              <option key={field.name} value={field.name}>
                {field.name} ({field.kind})
              </option>
            ))}
        </FormField>

        <FormField
          as="select"
          id="pivot-chart-type"
          label="Chart type"
          value={value.chartType}
          onChange={(event) => {
            onChange({
              ...value,
              chartType: asChartType(event.currentTarget.value),
            });
          }}
        >
          {PIVOT_CHART_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </FormField>

        <FormField
          as="select"
          id="pivot-sort"
          label="Sort"
          value={value.sort}
          onChange={(event) => {
            onChange({ ...value, sort: asSort(event.currentTarget.value) });
          }}
        >
          {PIVOT_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {sort.replace("_", " ")}
            </option>
          ))}
        </FormField>

        <FormField
          as="select"
          id="pivot-format"
          label="Value format"
          value={value.valueFormat ?? "auto"}
          onChange={(event) => {
            onChange({
              ...value,
              valueFormat: asValueFormat(event.currentTarget.value),
            });
          }}
        >
          {PIVOT_VALUE_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </FormField>

        <FormField
          id="pivot-category-limit"
          label={`Top categories (max ${MAX_PIVOT_CATEGORY_GROUPS})`}
          type="number"
          min={1}
          max={MAX_PIVOT_CATEGORY_GROUPS}
          value={value.category.limit ?? ""}
          placeholder="All"
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            onChange({
              ...value,
              category: {
                ...value.category,
                ...(Number.isNaN(next) ? {} : { limit: Math.trunc(next) }),
              },
            });
          }}
        />

        {value.series !== undefined && (
          <FormField
            id="pivot-series-limit"
            label={`Top series (max ${MAX_PIVOT_SERIES_GROUPS})`}
            type="number"
            min={1}
            max={MAX_PIVOT_SERIES_GROUPS}
            value={value.series.limit ?? ""}
            placeholder="All"
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              onChange({
                ...value,
                series: {
                  field: value.series?.field ?? seriesField?.name ?? "",
                  ...(Number.isNaN(next) ? {} : { limit: Math.trunc(next) }),
                },
              });
            }}
          />
        )}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-secondary">
          Measures ({value.series === undefined ? "up to 3" : "1 with series"})
        </legend>
        <div className="space-y-2">
          {value.measures.map((measure, index) => {
            const measureField = fields.find((field) => field.name === measure.field);
            const allowed = aggregationOptions(measureField);
            const disallowed = PIVOT_AGGREGATIONS.filter(
              (aggregation) => !allowed.includes(aggregation),
            );
            return (
              <div
                // eslint-disable-next-line react/no-array-index-key -- measures are ordered slots; position is identity
                key={`measure-${index}`}
                className="grid gap-2 sm:grid-cols-2"
              >
                <FormField
                  as="select"
                  id={`pivot-measure-field-${index}`}
                  label={`Measure ${index + 1} field`}
                  value={measure.field ?? ""}
                  onChange={(event) => {
                    updateMeasureField(index, event.currentTarget.value);
                  }}
                >
                  <option value="">Row count</option>
                  {measureChoices.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name} ({field.kind})
                    </option>
                  ))}
                </FormField>
                <FormField
                  as="select"
                  id={`pivot-measure-aggregation-${index}`}
                  label={`Measure ${index + 1} aggregation`}
                  value={measure.aggregation}
                  onChange={(event) => {
                    updateMeasureAggregation(index, event.currentTarget.value);
                  }}
                >
                  {allowed.map((aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {aggregation.replace("_", " ")}
                    </option>
                  ))}
                  {measureField !== undefined &&
                    disallowed.map((aggregation) => (
                      <option key={aggregation} value={aggregation} disabled>
                        {aggregation.replace("_", " ")} (not for {measureField.kind})
                      </option>
                    ))}
                </FormField>
              </div>
            );
          })}
          <div className="flex gap-2">
            {value.series === undefined && value.measures.length < 3 && (
              <button
                type="button"
                className="text-xs font-medium text-link"
                onClick={() => {
                  onChange({
                    ...value,
                    measures: [...value.measures, { aggregation: "count" }],
                  });
                }}
              >
                Add measure
              </button>
            )}
            {value.measures.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-destructive"
                onClick={() => {
                  onChange({ ...value, measures: value.measures.slice(0, -1) });
                }}
              >
                Remove last measure
              </button>
            )}
          </div>
        </div>
      </fieldset>

      <p className="text-xs text-secondary" aria-live="polite">
        {summarizePivotChartConfig(value)}
      </p>
      {issues.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive" aria-live="assertive">
          {issues.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              {issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
