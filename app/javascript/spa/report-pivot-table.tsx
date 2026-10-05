import { useId, useMemo, useState } from "react";
import {
  createCoreRowModel,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type ReactTable,
} from "@tanstack/react-table";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import type {
  AggregateReportDefinition,
  AggregateReportResult,
  DetailReportResult,
  ReportBuilderText,
  ReportDefinition,
  StructuredReportResult,
} from "./report-definition";

export type ReportTablePagination = {
  state: PaginationState;
  onChange: OnChangeFn<PaginationState>;
  pending: boolean;
  hasNext: boolean;
};

type ColumnStyle = { numeric?: boolean; rowHeader?: boolean; nowrap?: boolean; total?: boolean };
type ColumnStyles = ReadonlyMap<string, ColumnStyle>;
type ReportRow = { id: string } | { key: string };
const REPORT_TABLE_FEATURES = tableFeatures({
  rowPaginationFeature,
  coreRowModel: createCoreRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});
type ReportFeatures = typeof REPORT_TABLE_FEATURES;

function useReportTable<Row extends ReportRow>(
  data: Row[],
  columns: ColumnDef<ReportFeatures, Row>[],
  pagination?: ReportTablePagination,
) {
  const [localPagination, setLocalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  return useTable({
    features: REPORT_TABLE_FEATURES,
    data,
    columns,
    getRowId: (row) => ("id" in row ? row.id : row.key),
    manualPagination: pagination !== undefined,
    pageCount: pagination ? pagination.state.pageIndex + 1 + Number(pagination.hasNext) : undefined,
    state: { pagination: pagination?.state ?? localPagination },
    onPaginationChange: pagination?.onChange ?? setLocalPagination,
  });
}

export function StructuredReportTable({
  definition,
  result,
  text,
  pagination,
}: {
  definition: ReportDefinition;
  result: StructuredReportResult;
  text: ReportBuilderText;
  pagination?: ReportTablePagination;
}) {
  if (definition.mode === "detail" && result.mode === "detail")
    return <DetailReportTable result={result} text={text} pagination={pagination} />;
  if (definition.mode === "aggregate" && result.mode === "aggregate") {
    return (
      <AggregateReportTable
        definition={definition}
        result={result}
        text={text}
        pagination={pagination}
      />
    );
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {text.invalid_response}
    </p>
  );
}

function cellClass(style?: ColumnStyle) {
  return `px-4 py-3 text-primary ${style?.numeric === true ? "whitespace-nowrap text-right tabular-nums" : "text-left"} ${style?.nowrap === true ? "whitespace-nowrap" : ""} ${style?.total === true || style?.rowHeader === true ? "font-medium" : ""}`;
}

function ReportTableView<Row extends ReportRow>({
  table,
  styles,
  text,
  label,
  result,
  pagination,
}: {
  table: ReactTable<ReportFeatures, Row>;
  styles: ColumnStyles;
  text: ReportBuilderText;
  label: string;
  result: StructuredReportResult;
  pagination?: ReportTablePagination;
}) {
  const id = useId();
  const t = (key: string) => text[key] ?? key;
  const state = table.state.pagination;
  const offset = pagination ? result.pagination.offset : state.pageIndex * state.pageSize;
  const rows = table.getRowModel().rows;
  const pending = pagination?.pending ?? false;
  return (
    <>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-secondary">{t("no_results")}</p>
      ) : (
        <section
          aria-label={label}
          aria-busy={pending}
          className="max-h-96 overflow-auto rounded-xl border border-primary focus-ring"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll this named table region.
          tabIndex={0}
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="bg-surface text-secondary">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-primary">
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      scope={header.column.columns.length > 0 ? "colgroup" : "col"}
                      className={
                        header.column.columns.length > 0
                          ? "px-4 py-3 text-center font-medium"
                          : `${cellClass(styles.get(header.column.id))} font-medium`
                      }
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-subdued bg-container">
              {rows.map((row) => (
                <tr key={row.id}>
                  {row.getAllCells().map((cell) => {
                    const style = styles.get(cell.column.id);
                    const content = <table.FlexRender cell={cell} />;
                    return style?.rowHeader === true ? (
                      <th key={cell.id} scope="row" className={cellClass(style)}>
                        {content}
                      </th>
                    ) : (
                      <td key={cell.id} className={cellClass(style)}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <nav
        aria-label={t("pagination")}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <FormField
          as="select"
          id={`${id}-page-size`}
          label={t("rows_per_page")}
          value={state.pageSize}
          disabled={pending}
          containerClassName="w-36"
          onChange={(event) => {
            const pageSize = Number(event.target.value);
            table.setPagination({ pageIndex: 0, pageSize });
          }}
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </FormField>
        <p aria-live="polite" className="text-xs text-secondary">
          {t("page_range")
            .replace("%{start}", String(rows.length > 0 ? offset + 1 : 0))
            .replace("%{end}", String(rows.length > 0 ? offset + rows.length : 0))}
          {" · "}
          {t("page_label").replace("%{page}", String(Math.floor(offset / state.pageSize) + 1))}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || !table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage();
            }}
          >
            {t("previous_page")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || !table.getCanNextPage()}
            onClick={() => {
              table.nextPage();
            }}
          >
            {t("next_page")}
          </Button>
        </div>
      </nav>
    </>
  );
}

function AggregateReportTable({
  definition,
  result,
  text,
  pagination,
}: {
  definition: AggregateReportDefinition;
  result: AggregateReportResult;
  text: ReportBuilderText;
  pagination?: ReportTablePagination;
}) {
  const model = useMemo(() => {
    const t = (key: string) => text[key] ?? key;
    const cells = new Map<string, Map<string, (string | number | null)[]>>();
    for (const cell of result.cells) {
      let row = cells.get(cell.rowKey);
      if (!row) {
        row = new Map();
        cells.set(cell.rowKey, row);
      }
      row.set(cell.columnKey, cell.values);
    }
    const currencyIndex = definition.rows.findIndex((dimension) => dimension.field === "currency");
    const formatters = new Map<string, Intl.NumberFormat>();
    function format(
      value: string | number | null | undefined,
      measureIndex: number,
      rowValues: unknown[],
    ) {
      if (value === null || value === undefined) return t("missing_cell");
      const measure = result.measures[measureIndex];
      const rowCurrency = currencyIndex >= 0 ? rowValues[currencyIndex] : null;
      const currency = measure.currency ?? (typeof rowCurrency === "string" ? rowCurrency : null);
      const key =
        measure.format === "currency" && currency !== null && currency.length > 0
          ? currency
          : "number";
      let formatter = formatters.get(key);
      if (!formatter) {
        formatter = new Intl.NumberFormat(
          document.documentElement.lang || undefined,
          key === "number" ? { maximumFractionDigits: 20 } : { style: "currency", currency: key },
        );
        formatters.set(key, formatter);
      }
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ECMA-402 accepts exact decimal strings; TypeScript omits this overload.
      return (formatter.format as (value: string | number) => string)(value);
    }
    type Row = AggregateReportResult["rows"][number];
    const styles = new Map<string, ColumnStyle>();
    const columns: ColumnDef<ReportFeatures, Row>[] =
      definition.rows.length > 0
        ? definition.rows.map((dimension, index) => {
            const id = `row-${dimension.id}`;
            styles.set(id, { rowHeader: true });
            return {
              id,
              header: `${t(`field_${dimension.field}`)}${dimension.dateBucket ? ` · ${t(`bucket_${dimension.dateBucket}`)}` : ""}`,
              cell: ({ row }) => row.original.labels[index],
            };
          })
        : [{ id: "all", header: t("all_transactions"), cell: () => t("all_transactions") }];
    if (definition.rows.length === 0) styles.set("all", { rowHeader: true });
    if (definition.columns.length > 0) {
      for (const column of result.columns) {
        columns.push({
          id: `group-${column.key}`,
          header: column.labels.join(" / "),
          columns: result.measures.map((measure, index) => {
            const id = `cell-${column.key}-${measure.id}`;
            styles.set(id, { numeric: true });
            return {
              id,
              header: measure.label,
              cell: ({ row }) =>
                format(
                  cells.get(row.original.key)?.get(column.key)?.[index],
                  index,
                  row.original.values,
                ),
            };
          }),
        });
      }
    }
    const totals: ColumnDef<ReportFeatures, Row>[] = result.measures.map((measure, index) => {
      const id = `total-${measure.id}`;
      styles.set(id, { numeric: true, total: true });
      return {
        id,
        header: measure.label,
        cell: ({ row }) => format(row.original.totals[index], index, row.original.values),
      };
    });
    if (definition.columns.length > 0)
      columns.push({ id: "totals", header: t("row_total"), columns: totals });
    else columns.push(...totals);
    return { columns, styles };
  }, [definition, result, text]);
  const table = useReportTable(result.rows, model.columns, pagination);
  return (
    <div className="space-y-3">
      {result.truncated ? (
        <output className="block rounded-lg bg-warning/10 p-3 text-sm text-primary">
          {text.truncated}
        </output>
      ) : null}
      {definition.columns.length > 0 ? (
        <p className="text-xs text-secondary">
          {text.columns}:{" "}
          {definition.columns
            .map(
              (dimension) =>
                `${text[`field_${dimension.field}`]}${dimension.dateBucket ? ` · ${text[`bucket_${dimension.dateBucket}`]}` : ""}`,
            )
            .join(" / ")}
        </p>
      ) : null}
      <ReportTableView
        table={table}
        styles={model.styles}
        result={result}
        text={text}
        label={text.result_table}
        pagination={pagination}
      />
      {text.missing_cell_help ? (
        <p className="text-xs text-secondary">{text.missing_cell_help}</p>
      ) : null}
    </div>
  );
}

function DetailReportTable({
  result,
  text,
  pagination,
}: {
  result: DetailReportResult;
  text: ReportBuilderText;
  pagination?: ReportTablePagination;
}) {
  const model = useMemo(() => {
    const formatters = new Map<string, Intl.NumberFormat>();
    function format(value: string | number | null | undefined, field: string, currency: string) {
      if (value === null || value === undefined || value === "")
        return field === "category" ? text.uncategorized : text.missing_cell;
      if (field !== "amount") return String(value);
      let formatter = formatters.get(currency);
      if (!formatter) {
        formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 20,
        });
        formatters.set(currency, formatter);
      }
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ECMA-402 accepts exact decimal strings without lossy number conversion.
      return (formatter.format as (amount: string | number) => string)(value);
    }
    const styles = new Map<string, ColumnStyle>();
    const columns: ColumnDef<ReportFeatures, DetailReportResult["rows"][number]>[] =
      result.columns.map((column, index) => {
        styles.set(column.field, {
          numeric: column.field === "amount",
          nowrap: column.field === "date",
        });
        return {
          id: column.field,
          header: text[`field_${column.field}`] ?? column.label,
          cell: ({ row }) =>
            format(row.original.values[index], column.field, row.original.currency),
        };
      });
    return { columns, styles };
  }, [result, text]);
  const table = useReportTable(result.rows, model.columns, pagination);
  return (
    <div className="space-y-3">
      <ReportTableView
        table={table}
        styles={model.styles}
        result={result}
        text={text}
        label={text.detail_result_table}
        pagination={pagination}
      />
      <p className="text-xs text-secondary">{text.detail_missing_cell_help}</p>
    </div>
  );
}
