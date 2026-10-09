// eslint-disable import/max-dependencies -- Source cards share source queries, table primitives, chart mapping, and form controls.
import { useId, useMemo, useState } from "react";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import type { DashboardLayoutProps } from "./dashboard-storage";
import type { ReportBuilderText } from "./report-definition";
import { SourceResultTable } from "./report-pivot-table";
import { sourceQueryOptions, type Source, type SourceData } from "./source";
import {
  categoryColumns,
  sourceChartMapping,
  SourceResultChart,
  valueColumns,
  type ChartSettings,
} from "./source-visualization-chart";

export type SourceVisualizationView =
  | { type: "Table"; props: Omit<DashboardLayoutProps["Table"], "id"> }
  | { type: "Chart"; props: Omit<DashboardLayoutProps["Chart"], "id"> };

type SourceFieldProps = { source: Source | undefined; endpoint: string; text: ReportBuilderText };

function useSourceFields(source: Source | undefined, endpoint: string, all?: "all") {
  const options = source ? sourceQueryOptions(endpoint, source, all) : undefined;
  return useQuery<SourceData>({
    ...options,
    queryKey: options?.queryKey ?? ["source", ""],
    queryFn: options?.queryFn ?? skipToken,
  });
}

export function SourceVisualization({
  source,
  view,
  endpoint,
  text,
  onEditSource,
}: {
  source: Source;
  view: SourceVisualizationView;
  endpoint: string;
  text: ReportBuilderText;
  onEditSource: () => void;
}) {
  const t = (key: string) => text[key] ?? key;
  const [page, setPage] = useState({
    configuration: source.configuration,
    state: { pageIndex: 0, pageSize: 10 },
  });
  const pagination =
    page.configuration === source.configuration ? page.state : { pageIndex: 0, pageSize: 10 };
  const query = useQuery({
    ...sourceQueryOptions(
      endpoint,
      source,
      view.type === "Table"
        ? {
            limit: pagination.pageSize,
            offset: pagination.pageIndex * pagination.pageSize,
          }
        : "all",
    ),
    placeholderData:
      view.type === "Table" && page.configuration === source.configuration
        ? (previousData, previousQuery) =>
            previousQuery?.queryKey.length === 4 && previousQuery.queryKey[1] === source.id
              ? keepPreviousData(previousData)
              : undefined
        : undefined,
  });
  const data = query.data;
  const columns = useMemo(() => {
    if (!data) return [];
    if (view.type !== "Table" || view.props.visibleColumns.length === 0) return data.columns;
    const byKey = new Map(data.columns.map((column) => [column.key, column]));
    return view.props.visibleColumns.flatMap((key) => {
      const column = byKey.get(key);
      return column ? [column] : [];
    });
  }, [data, view]);
  const missingColumns =
    data && view.type === "Table"
      ? view.props.visibleColumns.filter(
          (key) => !data.columns.some((column) => column.key === key),
        )
      : [];
  const chart = data && view.type === "Chart" ? sourceChartMapping(data, view.props) : undefined;
  const resultsLabel = t("source_results_label").replace("%{name}", source.name);
  const backendPagination =
    data && view.type === "Table"
      ? {
          state: pagination,
          onChange: (update: PaginationState | ((current: PaginationState) => PaginationState)) => {
            setPage({
              configuration: source.configuration,
              state: typeof update === "function" ? update(pagination) : update,
            });
          },
          pending: query.isFetching,
          loading: query.isFetching,
          hasNext: data.result.pagination.hasNext,
        }
      : undefined;
  return (
    <article className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-xl bg-container p-4 shadow-border-xs">
      <header className="flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-medium text-primary">{source.name}</h2>
        <IconButton
          icon="pencil"
          label={t("source_edit_label").replace("%{name}", source.name)}
          onClick={onEditSource}
        />
      </header>
      <section
        aria-label={resultsLabel}
        aria-busy={query.isFetching}
        className="min-h-0 flex-1 space-y-3 overflow-auto"
      >
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            {query.error instanceof Error && query.error.message
              ? query.error.message
              : t("request_failed")}
          </p>
        )}
        {!data && query.isPending && <p className="text-sm text-secondary">{t("loading")}</p>}
        {data && (
          <>
            {data.result.truncated && (
              <output className="text-sm text-secondary">{t("source_truncated")}</output>
            )}
            {view.type === "Table" && missingColumns.length > 0 && (
              <output className="text-sm text-secondary">
                {t("source_missing_columns").replace("%{columns}", missingColumns.join(", "))}
              </output>
            )}
            {chart !== undefined && typeof chart !== "string" ? (
              <SourceResultChart
                mapping={chart}
                chartType={view.type === "Chart" ? view.props.chartType : "line"}
                label={t("source_chart_label").replace("%{name}", source.name)}
              />
            ) : (
              <>
                {typeof chart === "string" && (
                  <output className="text-sm text-secondary">{t(chart)}</output>
                )}
                {columns.length > 0 ? (
                  <SourceResultTable
                    data={data}
                    columns={columns}
                    text={text}
                    label={t("source_table_label").replace("%{name}", source.name)}
                    pagination={backendPagination}
                  />
                ) : (
                  <p className="text-sm text-secondary">{t("source_no_visible_columns")}</p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </article>
  );
}

export function TableColumnsField({
  source,
  endpoint,
  text,
  value,
  onChange,
}: SourceFieldProps & { value: string[]; onChange: (value: string[]) => void }) {
  const id = useId();
  const query = useSourceFields(source, endpoint);
  const t = (key: string) => text[key] ?? key;
  const columns = query.data?.columns ?? [];
  const missing = query.data
    ? value.filter((key) => !columns.some((column) => column.key === key))
    : [];
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-primary">{t("source_visible_columns")}</legend>
      <label htmlFor={`${id}-all`} className="flex items-center gap-2 text-sm text-primary">
        <input
          id={`${id}-all`}
          type="checkbox"
          checked={value.length === 0}
          disabled={!source || query.isPending || columns.length === 0}
          onChange={(event) => {
            onChange(event.target.checked ? [] : columns.map((column) => column.key));
          }}
        />
        {t("source_show_all_columns")}
      </label>
      <SourceFieldStatus
        source={source}
        pending={query.isPending}
        error={query.isError}
        text={text}
      />
      {columns.map((column, index) => (
        <label
          key={column.key}
          htmlFor={`${id}-${index}`}
          className="flex items-center gap-2 text-sm text-primary"
        >
          <input
            id={`${id}-${index}`}
            type="checkbox"
            checked={value.length === 0 || value.includes(column.key)}
            disabled={value.length === 1 && value[0] === column.key}
            onChange={(event) => {
              const selected = value.length === 0 ? columns.map((item) => item.key) : value;
              const next = event.target.checked
                ? [...selected.filter((key) => key !== column.key), column.key]
                : selected.filter((key) => key !== column.key);
              // Empty is the all-columns contract, so keep the last selected column selected.
              if (next.length > 0) onChange(next);
            }}
          />
          {column.label}
        </label>
      ))}
      {missing.length > 0 && (
        <output className="text-sm text-secondary">
          {t("source_missing_columns").replace("%{columns}", missing.join(", "))}
        </output>
      )}
    </fieldset>
  );
}

export function ChartTypeField({
  text,
  value,
  onChange,
}: {
  text: ReportBuilderText;
  value: ChartSettings["chartType"];
  onChange: (value: ChartSettings["chartType"]) => void;
}) {
  const id = useId();
  const t = (key: string) => text[key] ?? key;
  return (
    <FormField
      as="select"
      id={id}
      label={t("source_chart_type")}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (next === "line" || next === "bar" || next === "pie") onChange(next);
      }}
    >
      <option value="line">{t("source_chart_line")}</option>
      <option value="bar">{t("source_chart_bar")}</option>
      <option value="pie">{t("source_chart_pie")}</option>
    </FormField>
  );
}

export function ChartCategoryField(
  props: SourceFieldProps & { value: string; onChange: (value: string) => void },
) {
  return <ChartColumnField {...props} kind="category" />;
}

export function ChartValueField(
  props: SourceFieldProps & { value: string; onChange: (value: string) => void },
) {
  return <ChartColumnField {...props} kind="value" />;
}

function ChartColumnField({
  source,
  endpoint,
  text,
  value,
  onChange,
  kind,
}: SourceFieldProps & {
  value: string;
  onChange: (value: string) => void;
  kind: "category" | "value";
}) {
  const id = useId();
  const query = useSourceFields(source, endpoint, "all");
  const t = (key: string) => text[key] ?? key;
  const columns =
    kind === "category"
      ? categoryColumns(query.data?.columns ?? [])
      : valueColumns(query.data?.columns ?? []);
  const missing = value !== "" && !columns.some((column) => column.key === value);
  return (
    <div className="space-y-2">
      <FormField
        as="select"
        id={id}
        label={t(kind === "category" ? "source_category_field" : "source_value_field")}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        disabled={!source || query.isPending}
      >
        <option value="">{t("source_automatic")}</option>
        {missing && (
          <option value={value}>{t("source_missing_field").replace("%{field}", value)}</option>
        )}
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            {column.label}
          </option>
        ))}
      </FormField>
      <SourceFieldStatus
        source={source}
        pending={query.isPending}
        error={query.isError}
        text={text}
      />
    </div>
  );
}

function SourceFieldStatus({
  source,
  pending,
  error,
  text,
}: {
  source: Source | undefined;
  pending: boolean;
  error: boolean;
  text: ReportBuilderText;
}) {
  const t = (key: string) => text[key] ?? key;
  if (!source) return <p className="text-sm text-secondary">{t("source_choose_first")}</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("request_failed")}
      </p>
    );
  }
  if (pending) return <p className="text-sm text-secondary">{t("loading")}</p>;
  return null;
}
