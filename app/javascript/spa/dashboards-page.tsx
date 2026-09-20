import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import type { EventCallback } from "react-grid-layout";
import { useMemo, useState } from "react";
import * as z from "zod/mini";
// eslint-disable-next-line import/no-unassigned-import -- vendor stylesheet side-effect import
import "react-grid-layout/css/styles.css";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { readCsrfToken } from "./api/transactions";
import { SureqlEditor } from "./sureql-editor";
import {
  STARTER_QUERY,
  loadOrInstallStarterSnapshot,
  starterSnapshot,
  writeDashboardSnapshot,
  type DashboardSnapshot,
} from "./dashboard-storage";

const SureqlResultSchema = z.object({
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  row_count: z.number(),
  truncated: z.boolean(),
  html: z.optional(z.nullable(z.string())),
});

type SureqlResult = z.infer<typeof SureqlResultSchema>;

async function executeSureqlQuery(endpoint: string, source: string): Promise<SureqlResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": readCsrfToken(),
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

function ReportCardHeader({ name, onConfigure }: { name: string; onConfigure: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-t-xl border-b border-tertiary bg-surface-inset px-3 py-2">
      <div
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2 py-0.5 text-secondary active:cursor-grabbing"
        data-report-drag-handle
      >
        <Icon name="grip-horizontal" size="sm" />
        <h2 className="truncate select-none text-xs font-semibold uppercase tracking-wider text-primary">
          {name}
        </h2>
        <span className="ml-auto hidden select-none text-xs tabular-nums text-tertiary sm:inline">
          drag to move · resize from corner
        </span>
      </div>
      <button
        aria-label={`Configure ${name}`}
        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
        onClick={onConfigure}
        title="Configure report"
        type="button"
      >
        <Icon name="sliders-horizontal" size="sm" />
        <span className="hidden sm:inline">Configure</span>
      </button>
    </div>
  );
}

export function DashboardsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const [initialSnapshot] = useState(() => loadOrInstallStarterSnapshot(bootstrap.currentUser.id));
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dashboardNameDraft, setDashboardNameDraft] = useState(initialSnapshot.dashboardName);
  const [reportNameDraft, setReportNameDraft] = useState(initialSnapshot.reportName);
  const [reportQueryDraft, setReportQueryDraft] = useState(initialSnapshot.query);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const { width: gridWidth, containerRef } = useContainerWidth({
    measureBeforeMount: true,
  });

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sureql", snapshot.query],
    queryFn: () => executeSureqlQuery(bootstrap.apiPaths.sureqlRun, snapshot.query),
    retry: false,
    staleTime: 30_000,
  });

  const loading = isLoading || isFetching;

  // Persist only on explicit saves and interaction stops — never on every
  // keystroke or pointer move during editing, dragging, or resizing.
  const persistSnapshot = (nextSnapshot: DashboardSnapshot) => {
    setSnapshot(nextSnapshot);
    writeDashboardSnapshot(bootstrap.currentUser.id, nextSnapshot);
  };

  const handleInteractionStop: EventCallback = (nextLayout) => {
    persistSnapshot({ ...snapshot, layout: nextLayout });
  };

  const openRenameDialog = () => {
    setDashboardNameDraft(snapshot.dashboardName);
    setRenameDialogOpen(true);
  };

  const saveDashboardName = () => {
    const name = dashboardNameDraft.trim();
    if (name.length === 0) return;
    persistSnapshot({ ...snapshot, dashboardName: name });
    setRenameDialogOpen(false);
  };

  const openReportDialog = () => {
    setReportNameDraft(snapshot.reportName);
    setReportQueryDraft(snapshot.query);
    setReportDialogOpen(true);
  };

  const saveReportConfiguration = () => {
    const name = reportNameDraft.trim();
    const query = reportQueryDraft.trim();
    if (name.length === 0 || query.length === 0) return;

    const queryUnchanged = query === snapshot.query;
    persistSnapshot({ ...snapshot, reportName: name, query });
    setReportDialogOpen(false);

    if (queryUnchanged) void refetch();
  };

  const columns = useMemo(() => {
    if (data === undefined) return [];
    if (data.columns.length > 0) return data.columns;
    if (data.rows.length > 0) return Object.keys(data.rows[0]);
    return [];
  }, [data]);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
            Dashboards
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-primary">
              {snapshot.dashboardName}
            </h1>
            <button
              aria-label="Rename dashboard"
              className="inline-flex size-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-ring"
              onClick={openRenameDialog}
              title="Rename dashboard"
              type="button"
            >
              <Icon name="pencil" size="sm" />
            </button>
          </div>
          <p className="mt-1 text-sm text-secondary">
            Authorized SureQL reports using your live data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setResetDialogOpen(true);
          }}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
        >
          <Icon name="rotate-ccw" size="sm" />
          <span>Reset starter dashboard</span>
        </button>
      </header>

      <Modal
        ariaLabelledby="rename-dashboard-title"
        onClose={() => {
          setRenameDialogOpen(false);
        }}
        open={renameDialogOpen}
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveDashboardName();
          }}
        >
          <div>
            <h2 id="rename-dashboard-title" className="text-base font-semibold text-primary">
              Rename dashboard
            </h2>
            <p className="mt-1 text-sm text-secondary">
              Give this dashboard a name that describes its purpose.
            </p>
          </div>
          <div className="form-field__body">
            <label className="form-field__label" htmlFor="dashboard-name">
              Name
            </label>
            <input
              autoComplete="off"
              className="form-field__input"
              id="dashboard-name"
              maxLength={80}
              onChange={(event) => {
                setDashboardNameDraft(event.currentTarget.value);
              }}
              required
              type="text"
              value={dashboardNameDraft}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex min-h-8 items-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
              onClick={() => {
                setRenameDialogOpen(false);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-8 items-center rounded-lg button-bg-primary px-2.5 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover focus-ring"
              type="submit"
            >
              Save name
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        ariaLabelledby="configure-report-title"
        id="configure-report-dialog"
        onClose={() => {
          setReportDialogOpen(false);
        }}
        open={reportDialogOpen}
        panelClassName="w-full max-w-4xl rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <div className="max-h-[calc(100vh-2rem)] space-y-4 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="configure-report-title" className="text-base font-semibold text-primary">
                Configure report
              </h2>
            </div>
            <button
              aria-label="Close report configuration"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-ring"
              onClick={() => {
                setReportDialogOpen(false);
              }}
              type="button"
            >
              <Icon name="x" size="sm" />
            </button>
          </div>

          <div className="form-field__body">
            <label className="form-field__label" htmlFor="report-name">
              Report name
            </label>
            <input
              autoComplete="off"
              className="form-field__input"
              id="report-name"
              maxLength={80}
              onChange={(event) => {
                setReportNameDraft(event.currentTarget.value);
              }}
              required
              type="text"
              value={reportNameDraft}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-secondary">Query</p>
            <SureqlEditor
              value={reportQueryDraft}
              defaultValue={STARTER_QUERY}
              onChange={setReportQueryDraft}
              onRun={saveReportConfiguration}
              loading={loading}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="inline-flex min-h-8 items-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
              onClick={() => {
                setReportDialogOpen(false);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-8 items-center rounded-lg button-bg-primary px-2.5 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-ring"
              disabled={reportNameDraft.trim().length === 0 || reportQueryDraft.trim().length === 0}
              onClick={saveReportConfiguration}
              type="button"
            >
              Save and run
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        ariaLabelledby="reset-starter-title"
        id="reset-starter-dialog"
        onClose={() => {
          setResetDialogOpen(false);
        }}
        open={resetDialogOpen}
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <div className="space-y-3 p-4">
          <h2 id="reset-starter-title" className="text-sm font-semibold text-primary">
            Reset to the starter dashboard?
          </h2>
          <p className="text-sm text-secondary">
            Your dashboard name, report configuration, and layout will be replaced. This only
            affects your dashboard view in this browser.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setResetDialogOpen(false);
              }}
              className="inline-flex min-h-8 items-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const starter = starterSnapshot();
                persistSnapshot(starter);
                setResetDialogOpen(false);
              }}
              className="inline-flex min-h-8 items-center rounded-lg button-bg-primary px-2.5 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover focus-ring"
            >
              Reset dashboard
            </button>
          </div>
        </div>
      </Modal>

      <div ref={containerRef} className="min-w-0">
        <GridLayout
          width={gridWidth}
          layout={snapshot.layout}
          onLayoutChange={(nextLayout) => {
            setSnapshot((current) => ({ ...current, layout: nextLayout }));
          }}
          onDragStop={handleInteractionStop}
          onResizeStop={handleInteractionStop}
          gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12] }}
          dragConfig={{ enabled: true, handle: "[data-report-drag-handle]" }}
          resizeConfig={{ enabled: true, handles: ["se"] }}
        >
          <div
            key="sureql-report"
            className="flex size-full flex-col overflow-hidden rounded-xl border border-secondary bg-container shadow-border-xs"
          >
            <ReportCardHeader name={snapshot.reportName} onConfigure={openReportDialog} />

            <section
              aria-labelledby="query-results-heading"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
            >
              <div className="flex items-center justify-between">
                <h3 id="query-results-heading" className="text-sm font-medium text-secondary">
                  Results
                </h3>
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
                    <Icon
                      name="circle-alert"
                      size="sm"
                      className="mt-0.5 shrink-0 text-destructive"
                    />
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
        </GridLayout>
      </div>
    </div>
  );
}
