import { useId, useState } from "react";
import {
  createCoreRowModel,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
} from "@tanstack/react-table";
import { Button } from "./button";
import { FormField } from "./form-field";

const LOADING_ICON = { name: "loader-circle", className: "animate-spin", size: "sm" } as const;

export type TablePagination = {
  state: PaginationState;
  onChange: OnChangeFn<PaginationState>;
  pending: boolean;
  loading: boolean;
  hasNext: boolean;
};

export type ColumnStyle = {
  numeric?: boolean;
  rowHeader?: boolean;
  nowrap?: boolean;
  total?: boolean;
};
type TableRow = { id: string } | { key: string };
const PAGE_SIZES = [10, 25, 50, 100];
const TABLE_FEATURES = tableFeatures({
  rowPaginationFeature,
  coreRowModel: createCoreRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});
export type TableFeatures = typeof TABLE_FEATURES;

function cellClass(style?: ColumnStyle) {
  return `px-4 py-3 text-primary ${style?.numeric === true ? "whitespace-nowrap text-right tabular-nums" : "text-left"} ${style?.nowrap === true ? "whitespace-nowrap" : ""} ${style?.total === true || style?.rowHeader === true ? "font-medium" : ""}`;
}

export function Table<Row extends TableRow>({
  data,
  columns,
  styles,
  text,
  label,
  offset: resultOffset,
  pagination,
}: {
  data: Row[];
  columns: ColumnDef<TableFeatures, Row>[];
  styles: ReadonlyMap<string, ColumnStyle>;
  text: Record<string, string>;
  label: string;
  offset: number;
  pagination?: TablePagination;
}) {
  const [localPagination, setLocalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const table = useTable({
    features: TABLE_FEATURES,
    data,
    columns,
    getRowId: (row) => ("id" in row ? row.id : row.key),
    manualPagination: pagination !== undefined,
    pageCount: pagination ? pagination.state.pageIndex + 1 + Number(pagination.hasNext) : undefined,
    state: { pagination: pagination?.state ?? localPagination },
    onPaginationChange: pagination?.onChange ?? setLocalPagination,
  });
  const id = useId();
  const t = (key: string) => text[key] ?? key;
  const state = table.state.pagination;
  const offset = pagination ? resultOffset : state.pageIndex * state.pageSize;
  const rows = table.getRowModel().rows;
  const loading = pagination?.loading ?? false;
  const pending = loading || (pagination?.pending ?? false);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {rows.length === 0 ? (
        <p className="p-6 text-center text-secondary">{t("no_results")}</p>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-primary">
          <section
            aria-label={label}
            aria-busy={loading}
            className="min-h-0 min-w-0 flex-1 overflow-auto focus-ring -outline-offset-2"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll this named table region.
            tabIndex={0}
          >
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{label}</caption>
              <thead className="sticky top-0 z-10 bg-surface text-secondary">
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
        </div>
      )}
      <nav
        aria-label={t("pagination")}
        className="flex shrink-0 flex-wrap items-center justify-between gap-3"
      >
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
            aria-busy={loading}
            iconProps={loading ? LOADING_ICON : undefined}
            disabled={pending || !table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage();
            }}
          >
            {t("previous_page")}
          </Button>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <FormField
              as="select"
              id={`${id}-page-size`}
              aria-label={t("rows_per_page")}
              value={state.pageSize}
              disabled={pending}
              className="pr-6!"
              containerClassName="w-20"
              onChange={(event) => {
                const pageSize = Number(event.target.value);
                table.setPagination({ pageIndex: 0, pageSize });
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </FormField>
            <label htmlFor={`${id}-page-size`} className="text-xs text-secondary">
              {t("per_page")}
            </label>
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-busy={loading}
            iconProps={loading ? LOADING_ICON : undefined}
            disabled={pending || !table.getCanNextPage()}
            onClick={() => {
              table.nextPage();
            }}
          >
            {t("next_page")}
          </Button>
        </div>
      </nav>
    </div>
  );
}
