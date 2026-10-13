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
export const PAGE_SIZES = [10, 25, 50, 100] as const;
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
  rowClassName,
}: {
  data: Row[];
  columns: ColumnDef<TableFeatures, Row>[];
  styles: ReadonlyMap<string, ColumnStyle>;
  text: Record<string, string>;
  label: string;
  offset: number;
  pagination?: TablePagination;
  rowClassName?: (row: Row) => string | undefined;
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
                  <tr key={row.id} className={rowClassName?.(row.original)}>
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
      <TablePaginationBar
        disabled={pending}
        itemCount={rows.length}
        labels={{
          pagination: t("pagination"),
          previous: t("previous_page"),
          next: t("next_page"),
          perPage: t("per_page"),
          rowsPerPage: t("rows_per_page"),
        }}
        loading={loading}
        onPageChange={(nextPage) => {
          table.setPagination((current) => ({ ...current, pageIndex: nextPage - 1 }));
        }}
        onPerPageChange={(pageSize) => {
          table.setPagination({ pageIndex: 0, pageSize });
        }}
        page={Math.floor(offset / state.pageSize) + 1}
        perPage={state.pageSize}
        totalPages={table.getPageCount()}
      />
    </div>
  );
}
export type TablePaginationBarProps = {
  page: number;
  perPage: number;
  totalPages: number;
  itemCount: number;
  totalCount?: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  pageSizes?: readonly number[];
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  labels?: {
    pagination?: string;
    previous?: string;
    next?: string;
    perPage?: string;
    rowsPerPage?: string;
  };
};

export function TablePaginationBar({
  page,
  perPage,
  totalPages,
  itemCount,
  totalCount,
  onPageChange,
  onPerPageChange,
  pageSizes = PAGE_SIZES,
  disabled = false,
  loading = false,
  className = "",
  labels,
}: TablePaginationBarProps) {
  const id = useId();
  const offset = (page - 1) * perPage;
  const start = itemCount > 0 ? offset + 1 : 0;
  const end = itemCount > 0 ? offset + itemCount : 0;

  const previousLabel = labels?.previous ?? "Previous";
  const nextLabel = labels?.next ?? "Next";
  const perPageLabel = labels?.perPage ?? "per page";
  const rowsPerPageLabel = labels?.rowsPerPage ?? "Rows per page";
  const paginationAria = labels?.pagination ?? "Pagination";

  return (
    <nav
      aria-label={paginationAria}
      className={`flex shrink-0 flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <p aria-live="polite" className="text-xs text-secondary">
        {`Rows ${start}–${end}`}
        {totalCount !== undefined && totalCount > 0 ? ` of ${totalCount}` : ""}
        {" · "}
        {`Page ${page}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          aria-busy={loading}
          disabled={disabled || page <= 1}
          iconProps={loading ? LOADING_ICON : undefined}
          onClick={() => {
            onPageChange(page - 1);
          }}
          size="sm"
          variant="secondary"
        >
          {previousLabel}
        </Button>
        {onPerPageChange ? (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <FormField
              aria-label={rowsPerPageLabel}
              as="select"
              className="pr-6!"
              containerClassName="w-20"
              disabled={disabled}
              id={`${id}-page-size`}
              onChange={(event) => {
                const newSize = Number(event.target.value);
                onPerPageChange(newSize);
              }}
              value={perPage}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </FormField>
            <label className="text-xs text-secondary" htmlFor={`${id}-page-size`}>
              {perPageLabel}
            </label>
          </div>
        ) : null}
        <Button
          aria-busy={loading}
          disabled={disabled || page >= totalPages}
          iconProps={loading ? LOADING_ICON : undefined}
          onClick={() => {
            onPageChange(page + 1);
          }}
          size="sm"
          variant="secondary"
        >
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
