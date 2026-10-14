import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Table,
  type ColumnStyle,
  type TableFeatures,
  type TablePagination,
} from "./components/table";
import type {
  AggregateReportDefinition,
  AggregateReportResult,
  DetailReportResult,
  ReportBuilderText,
  ReportDefinition,
  StructuredReportResult,
} from "./report-definition";
import type { SourceColumn, SourceData, SourceRow } from "./source";

export function StructuredReportTable({
  definition,
  result,
  text,
  pagination,
}: {
  definition: ReportDefinition;
  result: StructuredReportResult;
  text: ReportBuilderText;
  pagination?: TablePagination;
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

function AggregateReportTable({
  definition,
  result,
  text,
  pagination,
}: {
  definition: AggregateReportDefinition;
  result: AggregateReportResult;
  text: ReportBuilderText;
  pagination?: TablePagination;
}) {
  const model = useMemo(() => {
    const t = (key: string) => text[key] ?? key;
    const records = new Map(
      result.metadata.rows.map((row, index) => [row.key, result.result[index]]),
    );
    const valueFields = new Map<string, Map<string, AggregateReportResult["metadata"]["fields"]>>();
    for (const field of result.metadata.fields) {
      if (field.columnKey === undefined || field.measureId === undefined) continue;
      let group = valueFields.get(field.columnKey);
      if (!group) {
        group = new Map();
        valueFields.set(field.columnKey, group);
      }
      const fields = group.get(field.measureId) ?? [];
      fields.push(field);
      group.set(field.measureId, fields);
    }
    const currencyIndex = definition.rows.findIndex((dimension) => dimension.field === "currency");
    const formatters = new Map<string, Intl.NumberFormat>();
    function format(
      value: string | number | null | undefined,
      measureIndex: number,
      rowValues: unknown[],
    ) {
      if (value === null || value === undefined) return t("missing_cell");
      const measure = result.metadata.measures[measureIndex];
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
    type Row = AggregateReportResult["metadata"]["rows"][number];
    const styles = new Map<string, ColumnStyle>();
    const columns: ColumnDef<TableFeatures, Row>[] =
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
      for (const column of result.metadata.columns) {
        columns.push({
          id: `group-${column.key}`,
          header: column.labels.join(" / "),
          columns: result.metadata.measures.map((measure, index) => {
            const id = `cell-${column.key}-${measure.id}`;
            styles.set(id, { numeric: true });
            return {
              id,
              header: measure.label,
              cell: ({ row }) => {
                const fields = valueFields.get(column.key)?.get(measure.id) ?? [];
                const field =
                  fields.find(
                    (candidate) =>
                      candidate.currency === null || candidate.currency === row.original.currency,
                  ) ?? fields.at(0);
                return format(
                  field ? records.get(row.original.key)?.[field.key] : undefined,
                  index,
                  row.original.values,
                );
              },
            };
          }),
        });
      }
    }
    const totals: ColumnDef<TableFeatures, Row>[] = result.metadata.measures.map(
      (measure, index) => {
        const id = `total-${measure.id}`;
        styles.set(id, { numeric: true, total: true });
        return {
          id,
          header: measure.label,
          cell: ({ row }) =>
            format(records.get(row.original.key)?.[measure.id], index, row.original.values),
        };
      },
    );
    if (definition.columns.length > 0)
      columns.push({ id: "totals", header: t("row_total"), columns: totals });
    else columns.push(...totals);
    return { columns, styles };
  }, [definition, result, text]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
      <Table
        data={result.metadata.rows}
        columns={model.columns}
        styles={model.styles}
        offset={result.pagination.offset}
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
  pagination?: TablePagination;
}) {
  const model = useMemo(() => {
    const formatters = new Map<string, Intl.NumberFormat>();
    function format(value: string | number | null | undefined, field: string, currency: string) {
      if (value === null || value === undefined || value === "") {
        if (field === "category") return text.uncategorized;
        if (field === "merchant") return text.no_merchant;
        return text.missing_cell;
      }
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
    const columns: ColumnDef<TableFeatures, DetailReportResult["metadata"]["rows"][number]>[] =
      result.metadata.fields.map((column) => {
        styles.set(column.field, {
          numeric: column.field === "amount",
          nowrap: column.field === "date",
        });
        return {
          id: column.field,
          header: text[`field_${column.field}`] ?? column.label,
          cell: ({ row }) =>
            format(result.result[row.index][column.key], column.field, row.original.currency),
        };
      });
    return { columns, styles };
  }, [result, text]);
  return (
    <Table
      data={result.metadata.rows}
      columns={model.columns}
      styles={model.styles}
      offset={result.pagination.offset}
      text={text}
      label={text.detail_result_table}
      pagination={pagination}
    />
  );
}

export function SourceResultTable({
  data,
  columns,
  text,
  label,
  pagination,
}: {
  data: SourceData;
  columns: SourceColumn[];
  text: ReportBuilderText;
  label: string;
  pagination?: TablePagination;
}) {
  const model = useMemo(() => {
    const formatters = new Map<string, Intl.NumberFormat>();
    const styles = new Map<string, ColumnStyle>();
    const tableColumns: ColumnDef<TableFeatures, SourceRow>[] = columns.map((column) => {
      styles.set(column.key, {
        numeric: column.kind === "number" || column.kind === "currency",
        nowrap: column.kind === "date",
      });
      return {
        id: column.key,
        header: column.label,
        cell: ({ row }) => {
          const value = row.original.values[column.key];
          if (value === null || value === undefined || value === "") {
            if (column.key === "category") return text.uncategorized;
            if (column.key === "merchant") return text.no_merchant;
            return text.missing_cell;
          }
          if (column.kind !== "currency") return String(value);
          const currency = column.currency ?? row.original.currency;
          if (!currency) return String(value);
          let formatter = formatters.get(currency);
          if (!formatter) {
            try {
              formatter = new Intl.NumberFormat(document.documentElement.lang || undefined, {
                style: "currency",
                currency,
                maximumFractionDigits: 20,
              });
            } catch {
              return `${value} ${currency}`;
            }
            formatters.set(currency, formatter);
          }
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ECMA-402 formats exact decimal strings without lossy number conversion.
          return (formatter.format as (amount: string | number) => string)(value);
        },
      };
    });
    return { columns: tableColumns, styles };
  }, [columns, text]);
  return (
    <Table
      data={data.rows}
      columns={model.columns}
      styles={model.styles}
      offset={data.result.pagination.offset}
      text={text}
      label={label}
      pagination={pagination}
    />
  );
}
