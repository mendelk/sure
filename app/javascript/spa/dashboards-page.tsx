import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as z from "zod/mini";
import { Icon } from "./icon";
import { SureqlEditor } from "./sureql-editor";

const DEFAULT_QUERY = "from transactions\nsort {-date}\ntake 10";

const SureqlResultSchema = z.object({
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  row_count: z.number(),
  truncated: z.boolean(),
  html: z.optional(z.nullable(z.string())),
});

type SureqlResult = z.infer<typeof SureqlResultSchema>;

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

async function executeSureqlQuery(endpoint: string, source: string): Promise<SureqlResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    body: JSON.stringify({ source }),
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return SureqlResultSchema.parse(data);
}

function formatCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined)
    return <span className="italic text-tertiary">null</span>;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return JSON.stringify(value);
}

function getRowKey(row: Record<string, unknown>, index: number): string {
  if (typeof row.id === "string" && row.id.length > 0) return row.id;
  return `row-${index}-${JSON.stringify(row)}`;
}

export function DashboardsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [executedQuery, setExecutedQuery] = useState(DEFAULT_QUERY);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sureql", executedQuery],
    queryFn: () => executeSureqlQuery(bootstrap.apiPaths.sureqlRun, executedQuery),
    retry: false,
    staleTime: 30_000,
  });

  const loading = isLoading || isFetching;

  const handleRun = () => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    if (trimmed === executedQuery) void refetch();
    else setExecutedQuery(trimmed);
  };

  const columns = useMemo(() => {
    if (data === undefined) return [];
    if (data.columns.length > 0) return data.columns;
    if (data.rows.length > 0) return Object.keys(data.rows[0]);
    return [];
  }, [data]);

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Dashboards</h1>
        <p className="mt-1 text-sm text-secondary">
          Live SureQL query editor and real authorized query results.
        </p>
      </header>

      <SureqlEditor
        value={query}
        defaultValue={DEFAULT_QUERY}
        onChange={setQuery}
        onRun={handleRun}
        loading={loading}
      />

      <section aria-labelledby="query-results-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="query-results-heading" className="text-base font-semibold text-primary">
            Query Results
          </h2>
          {!loading && error === null && data !== undefined && (
            <span className="text-xs text-secondary">
              {data.row_count} {data.row_count === 1 ? "row" : "rows"}
            </span>
          )}
        </div>

        {loading && (
          <div
            aria-busy="true"
            aria-live="polite"
            className="flex items-center justify-center gap-2.5 rounded-xl border border-secondary bg-container p-12 text-secondary"
          >
            <Icon name="loader-circle" className="animate-spin" />
            <span className="text-sm font-medium">Running query…</span>
          </div>
        )}

        {!loading && error !== null && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-destructive bg-container p-4 text-sm text-destructive"
          >
            <div className="flex items-start gap-2.5">
              <Icon name="circle-alert" size="sm" className="mt-0.5 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="font-semibold">Query error</p>
                <pre className="mt-1 max-h-64 overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                  {error.message}
                </pre>
              </div>
            </div>
          </div>
        )}

        {!loading && error === null && data !== undefined && data.truncated && (
          <output className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
            <Icon name="circle-alert" size="sm" className="text-warning" />
            <span>Results truncated: showing first {data.row_count} rows.</span>
          </output>
        )}

        {!loading && error === null && data !== undefined && data.rows.length === 0 && (
          <div className="rounded-xl border border-secondary bg-container p-8 text-center text-secondary">
            <p className="text-sm font-medium">No results found for this query.</p>
          </div>
        )}

        {!loading && error === null && data !== undefined && data.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-secondary bg-container shadow-border-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-secondary bg-surface-inset text-xs font-semibold uppercase tracking-wider text-secondary">
                <tr>
                  {columns.map((col) => (
                    <th key={col} scope="col" className="px-4 py-3 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary font-mono text-xs text-primary">
                {data.rows.map((row, index) => (
                  <tr key={getRowKey(row, index)} className="hover:bg-surface-hover">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 whitespace-nowrap">
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
