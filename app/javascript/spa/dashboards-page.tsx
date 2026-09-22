/* eslint-disable import/max-dependencies -- Route composes UI primitives with dashboard modules. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import type { EventCallback } from "react-grid-layout";
import { useMemo, useState } from "react";
// eslint-disable-next-line import/no-unassigned-import -- vendor stylesheet side-effect import
import "react-grid-layout/css/styles.css";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { executeSureqlQuery } from "./api/transactions";
import { DashboardSwitcher } from "./dashboard-switcher";
import { ReportChart } from "./report-chart";
import { chartMappingForResult } from "./report-chart-mapping";
import { SureqlEditor } from "./sureql-editor";
import { useSureqlPreview } from "./sureql-preview";
import {
  STARTER_QUERY,
  generateDashboardId,
  loadOrInstallStarterSnapshot,
  selectActiveDashboard,
  starterSnapshot,
  writeDashboardSnapshot,
  type Dashboard,
  type DashboardReport,
  type DashboardSnapshot,
} from "./dashboard-storage";

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

function generateReportId(): string {
  const parts = crypto.getRandomValues(new Uint32Array(4));
  return `report-${Array.from(parts, (part) => part.toString(16).padStart(8, "0")).join("")}`;
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
      <Button
        aria-label={`Configure ${name}`}
        className="shrink-0"
        onClick={onConfigure}
        size="sm"
        iconProps={{ name: "sliders-horizontal", size: "sm" }}
        label="Configure"
        labelClassName="hidden sm:inline"
        title="Configure report"
        variant="secondary"
      />
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  visibleColumns,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  visibleColumns?: string[];
}) {
  const shown = visibleColumns ?? columns;
  return (
    <div className="overflow-x-auto rounded-xl border border-secondary bg-container shadow-border-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-secondary bg-surface-inset text-xs font-semibold uppercase tracking-wider text-secondary">
          <tr>
            {shown.map((column) => (
              <th key={column} scope="col" className="px-4 py-3 whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tertiary font-mono text-xs text-primary">
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)} className="hover:bg-surface-hover">
              {shown.map((column) => (
                <td key={column} className="px-4 py-2.5 whitespace-nowrap">
                  {formatCellValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportCard({
  endpoint,
  onConfigure,
  report,
}: {
  endpoint: string;
  onConfigure: () => void;
  report: DashboardReport;
}) {
  const { data, error, isFetching, isLoading } = useQuery({
    queryKey: ["sureql", report.id, report.query],
    queryFn: () => executeSureqlQuery(endpoint, report.query),
    retry: false,
    staleTime: 30_000,
  });
  const loading = isLoading || isFetching;
  const columns = useMemo(() => {
    if (data === undefined) return [];
    if (data.columns.length > 0) return data.columns;
    if (data.rows.length > 0) return Object.keys(data.rows[0]);
    return [];
  }, [data]);
  const chartMapping = useMemo(
    () => (data === undefined ? undefined : chartMappingForResult(data)),
    [data],
  );

  return (
    <div className="flex size-full flex-col overflow-hidden rounded-xl border border-secondary bg-container shadow-border-xs">
      <ReportCardHeader name={report.name} onConfigure={onConfigure} />

      <section
        aria-label={`${report.name} results`}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-secondary">Results</h3>
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
            aria-live="assertive"
            className="rounded-xl border border-destructive bg-container p-4 text-sm text-destructive"
            role="alert"
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

        {!loading &&
          error === null &&
          data !== undefined &&
          data.rows.length > 0 &&
          report.presentation === "chart" &&
          chartMapping !== undefined && (
            <div className="space-y-4">
              <ReportChart mapping={chartMapping} reportName={report.name} />
              <details className="rounded-xl border border-secondary bg-container shadow-border-xs">
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-secondary">
                  View data table ({chartMapping.xColumn}, {chartMapping.yColumn})
                </summary>
                <div className="overflow-x-auto border-t border-secondary">
                  <ReportTable
                    columns={columns}
                    rows={data.rows}
                    visibleColumns={[chartMapping.xColumn, chartMapping.yColumn]}
                  />
                </div>
              </details>
            </div>
          )}
        {!loading &&
          error === null &&
          data !== undefined &&
          data.rows.length > 0 &&
          report.presentation === "chart" &&
          chartMapping === undefined && (
            <div className="space-y-4">
              <p className="rounded-lg border border-secondary bg-surface-inset px-3 py-2 text-xs text-secondary">
                Chart needs a date column and a numeric column — showing the table instead.
              </p>
              <ReportTable columns={columns} rows={data.rows} />
            </div>
          )}
        {!loading &&
          error === null &&
          data !== undefined &&
          data.rows.length > 0 &&
          report.presentation !== "chart" && <ReportTable columns={columns} rows={data.rows} />}
      </section>
    </div>
  );
}

export function DashboardsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: "/dashboards" });
  const navigate = useNavigate({ from: "/dashboards" });
  const [initialSnapshot] = useState(() => loadOrInstallStarterSnapshot(bootstrap.currentUser.id));
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const activeDashboard = selectActiveDashboard(snapshot, routeSearch.dashboard);
  const [reportNameDraft, setReportNameDraft] = useState("");
  const [reportQueryDraft, setReportQueryDraft] = useState(STARTER_QUERY);
  const [reportPresentationDraft, setReportPresentationDraft] = useState<"table" | "chart">(
    "table",
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportPendingRemovalId, setReportPendingRemovalId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [titleEditor, setTitleEditor] = useState<{ id: string; draft: string } | null>(null);
  const { width: gridWidth, containerRef } = useContainerWidth({
    measureBeforeMount: true,
  });
  const preview = useSureqlPreview();
  const selectedReport = activeDashboard?.reports.find((report) => report.id === selectedReportId);
  const reportPendingRemoval = activeDashboard?.reports.find(
    (report) => report.id === reportPendingRemovalId,
  );
  const draftQueryTrimmed = reportQueryDraft.trim();
  const previewMatchesDraft =
    preview.status !== "running" &&
    preview.result !== null &&
    preview.resultQuery !== null &&
    preview.resultQuery.trim() === draftQueryTrimmed &&
    draftQueryTrimmed.length > 0;
  const previewRunning = preview.status === "running";
  const previewColumns = useMemo(() => {
    if (preview.result === null) return [];
    if (preview.result.columns.length > 0) return preview.result.columns;
    if (preview.result.rows.length > 0) return Object.keys(preview.result.rows[0]);
    return [];
  }, [preview.result]);
  // Persist only on explicit saves and interaction stops — never on every
  const persistSnapshot = (nextSnapshot: DashboardSnapshot) => {
    setSnapshot(nextSnapshot);
    writeDashboardSnapshot(bootstrap.currentUser.id, nextSnapshot);
  };

  const updateActiveDashboard = (update: (dashboard: Dashboard) => Dashboard) => {
    if (activeDashboard === undefined) return;
    persistSnapshot({
      dashboards: snapshot.dashboards.map((dashboard) =>
        dashboard.id === activeDashboard.id ? update(dashboard) : dashboard,
      ),
    });
  };

  const switchDashboard = (dashboardId: string) => {
    void navigate({ search: { dashboard: dashboardId } });
  };

  const handleInteractionStop: EventCallback = (nextLayout) => {
    if (activeDashboard === undefined) return;
    updateActiveDashboard((dashboard) => ({ ...dashboard, layout: nextLayout }));
  };

  const startEditingDashboardName = (dashboard: Dashboard) => {
    setTitleEditor({ id: dashboard.id, draft: dashboard.name });
  };

  const cancelEditingDashboardName = () => {
    setTitleEditor(null);
  };

  const saveDashboardName = () => {
    if (titleEditor === null || activeDashboard === undefined) return;
    if (titleEditor.id !== activeDashboard.id) {
      setTitleEditor(null);
      return;
    }
    const name = titleEditor.draft.trim();
    if (name.length === 0) return;
    updateActiveDashboard((dashboard) => ({ ...dashboard, name }));
    setTitleEditor(null);
  };

  const createDashboard = () => {
    const count = snapshot.dashboards.length + 1;
    const dashboard: Dashboard = {
      id: generateDashboardId(),
      name: `Untitled ${count}`,
      reports: [],
      layout: [],
    };
    persistSnapshot({ dashboards: [...snapshot.dashboards, dashboard] });
    setTitleEditor({ id: dashboard.id, draft: dashboard.name });
    switchDashboard(dashboard.id);
  };

  const deleteDashboard = () => {
    if (activeDashboard === undefined) return;
    const dashboardId = activeDashboard.id;
    const remaining = snapshot.dashboards.filter((dashboard) => dashboard.id !== dashboardId);
    const nextSnapshot = { dashboards: remaining };
    setSnapshot(nextSnapshot);
    writeDashboardSnapshot(bootstrap.currentUser.id, nextSnapshot);
    for (const report of activeDashboard.reports)
      queryClient.removeQueries({ queryKey: ["sureql", report.id] });
    setDeleteDialogOpen(false);
    setTitleEditor(null);
    if (remaining.length > 0) switchDashboard(remaining[0].id);
    else void navigate({ search: {} });
  };

  const resetStarterDashboard = () => {
    const starter = starterSnapshot();
    persistSnapshot(starter);
    setResetDialogOpen(false);
    setTitleEditor(null);
    void navigate({ search: {} });
  };

  const openReportDialog = (report: DashboardReport) => {
    setReportNameDraft(report.name);
    setReportQueryDraft(report.query);
    setReportPresentationDraft(report.presentation);
    setSelectedReportId(report.id);
    preview.reset();
  };

  const addReport = (presentation: "table" | "chart" = "table") => {
    if (activeDashboard === undefined) return;
    const report: DashboardReport = {
      id: generateReportId(),
      name: "New report",
      query: STARTER_QUERY,
      presentation,
    };
    const y = activeDashboard.layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
    updateActiveDashboard((dashboard) => ({
      ...dashboard,
      reports: [...dashboard.reports, report],
      layout: [
        ...dashboard.layout,
        {
          i: report.id,
          x: 0,
          y,
          w: 12,
          h: 4,
          minW: 4,
          minH: 3,
        },
      ],
    }));
    openReportDialog(report);
  };

  const runDraftPreview = () => {
    preview.run(bootstrap.apiPaths.sureqlRun, reportQueryDraft);
  };

  const saveReportConfiguration = () => {
    const report = selectedReport;
    const name = reportNameDraft.trim();
    const query = reportQueryDraft.trim();
    if (report === undefined || name.length === 0 || query.length === 0) return;
    if (!previewMatchesDraft) return;

    updateActiveDashboard((dashboard) => ({
      ...dashboard,
      reports: dashboard.reports.map((candidate) =>
        candidate.id === report.id
          ? { ...candidate, name, query, presentation: reportPresentationDraft }
          : candidate,
      ),
    }));
    setSelectedReportId(null);
    preview.reset();

    if (query === report.query) {
      void queryClient.refetchQueries({
        exact: true,
        queryKey: ["sureql", report.id, query],
      });
    }
  };

  const cancelReportConfiguration = () => {
    if (selectedReport !== undefined) {
      setReportNameDraft(selectedReport.name);
      setReportQueryDraft(selectedReport.query);
      setReportPresentationDraft(selectedReport.presentation);
    }
    setSelectedReportId(null);
    preview.reset();
  };

  const removeReport = () => {
    const report = reportPendingRemoval;
    if (report === undefined) return;
    updateActiveDashboard((dashboard) => ({
      ...dashboard,
      reports: dashboard.reports.filter((candidate) => candidate.id !== report.id),
      layout: dashboard.layout.filter((item) => item.i !== report.id),
    }));
    queryClient.removeQueries({ queryKey: ["sureql", report.id] });
    setReportPendingRemovalId(null);
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {activeDashboard !== undefined && (
          <div className="flex items-center gap-2">
            {titleEditor !== null && titleEditor.id === activeDashboard.id ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveDashboardName();
                }}
              >
                <FormField
                  aria-label="Dashboard name"
                  autoComplete="off"
                  containerClassName="w-64"
                  id="dashboard-name"
                  maxLength={80}
                  onChange={(event) => {
                    setTitleEditor({ id: titleEditor.id, draft: event.currentTarget.value });
                  }}
                  onFocus={(event) => {
                    event.currentTarget.select();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") cancelEditingDashboardName();
                  }}
                  ref={(element) => {
                    element?.focus();
                  }}
                  required
                  type="text"
                  value={titleEditor.draft}
                />
                <IconButton label="Save dashboard name" icon="check" size="sm" type="submit" />
                <IconButton
                  label="Cancel renaming dashboard"
                  icon="x"
                  onClick={cancelEditingDashboardName}
                  size="sm"
                />
              </form>
            ) : (
              <>
                <DashboardSwitcher
                  activeDashboardId={activeDashboard.id}
                  dashboards={snapshot.dashboards}
                  onSelect={switchDashboard}
                />
                <IconButton
                  label="Rename dashboard"
                  icon="pencil"
                  onClick={() => {
                    startEditingDashboardName(activeDashboard);
                  }}
                  size="sm"
                />
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button iconProps={{ name: "plus", size: "sm" }} onClick={createDashboard} size="sm">
            New dashboard
          </Button>
          {activeDashboard !== undefined && (
            <>
              <Button
                iconProps={{ name: "plus", size: "sm" }}
                onClick={() => {
                  addReport("table");
                }}
                size="sm"
              >
                Add table
              </Button>
              <Button
                iconProps={{ name: "chart-bar", size: "sm" }}
                onClick={() => {
                  addReport("chart");
                }}
                size="sm"
                variant="secondary"
              >
                Add chart
              </Button>
            </>
          )}
          {activeDashboard !== undefined && (
            <Button
              onClick={() => {
                setDeleteDialogOpen(true);
              }}
              size="sm"
              variant="destructive-outline"
            >
              Delete dashboard
            </Button>
          )}
          <Button
            onClick={() => {
              setResetDialogOpen(true);
            }}
            iconProps={{ name: "rotate-ccw", size: "sm" }}
            size="sm"
            variant="secondary"
          >
            Reset starter dashboard
          </Button>
        </div>
      </header>

      <Modal
        ariaLabelledby="delete-dashboard-title"
        id="delete-dashboard-dialog"
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
        open={deleteDialogOpen}
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <div className="space-y-3 p-4">
          <h2 id="delete-dashboard-title" className="text-sm font-semibold text-primary">
            Delete dashboard?
          </h2>
          <p className="text-sm text-secondary">
            {activeDashboard === undefined
              ? "This dashboard and its report cards will be removed."
              : `${activeDashboard.name}, its report cards, and layouts will be removed.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setDeleteDialogOpen(false);
              }}
              size="sm"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button onClick={deleteDashboard} size="sm" variant="destructive">
              Delete dashboard
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        ariaLabelledby="configure-report-title"
        id="configure-report-dialog"
        onClose={cancelReportConfiguration}
        open={selectedReport !== undefined}
        panelClassName="w-full max-w-4xl rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <div className="max-h-[calc(100vh-2rem)] space-y-4 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id="configure-report-title" className="text-base font-semibold text-primary">
              Configure report
            </h2>
            <IconButton
              label="Close report configuration"
              className="shrink-0"
              icon="x"
              onClick={cancelReportConfiguration}
              size="sm"
            />
          </div>

          <FormField
            autoComplete="off"
            id="report-name"
            label="Report name"
            maxLength={80}
            onChange={(event) => {
              setReportNameDraft(event.currentTarget.value);
            }}
            required
            type="text"
            value={reportNameDraft}
          />

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-secondary">Query</p>
              {selectedReport !== undefined &&
                (draftQueryTrimmed === selectedReport.query.trim() ? (
                  <span className="text-xs text-tertiary">Draft matches saved query</span>
                ) : (
                  <span className="text-xs font-medium text-warning">Unsaved changes</span>
                ))}
            </div>
            <SureqlEditor
              defaultValue={STARTER_QUERY}
              loading={previewRunning}
              onChange={setReportQueryDraft}
              onRun={runDraftPreview}
              value={reportQueryDraft}
            />
            <div aria-live="polite" className="mt-2 space-y-2">
              {previewRunning && (
                <p className="flex items-center gap-2 rounded-lg border border-secondary bg-surface-inset px-3 py-2 text-xs text-secondary">
                  <Icon name="loader-circle" size="sm" className="animate-spin" />
                  <span>Running preview of the current draft…</span>
                </p>
              )}
              {preview.error !== null && (
                <div
                  aria-live="assertive"
                  className="rounded-xl border border-destructive bg-container p-4 text-sm text-destructive"
                  role="alert"
                >
                  <div className="flex items-start gap-2.5">
                    <Icon
                      name="circle-alert"
                      size="sm"
                      className="mt-0.5 shrink-0 text-destructive"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold">Preview error</p>
                      <pre className="mt-1 max-h-64 overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                        {preview.error}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
              {preview.error === null &&
                preview.result !== null &&
                preview.resultQuery !== null && (
                  <div className="space-y-2 rounded-xl border border-secondary bg-surface-inset p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-secondary">
                        Preview — not saved yet ({preview.result.row_count}{" "}
                        {preview.result.row_count === 1 ? "row" : "rows"})
                      </p>
                      {preview.resultQuery.trim() !== draftQueryTrimmed && (
                        <p className="text-xs font-medium text-warning">
                          Draft changed since this preview — Run again to refresh.
                        </p>
                      )}
                    </div>
                    {preview.result.truncated && (
                      <output className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                        <Icon name="circle-alert" size="sm" className="text-warning" />
                        <span>
                          Results truncated: showing first {preview.result.row_count} rows.
                        </span>
                      </output>
                    )}
                    {preview.result.rows.length === 0 ? (
                      <p className="text-sm text-secondary">No results found for this query.</p>
                    ) : (
                      <ReportTable columns={previewColumns} rows={preview.result.rows} />
                    )}
                    <details className="rounded-lg border border-secondary bg-container">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-secondary">
                        Generated SQL (technical)
                      </summary>
                      <pre className="max-h-64 overflow-auto border-t border-secondary px-3 py-2 font-mono text-xs whitespace-pre-wrap text-secondary">
                        {preview.result.sql}
                      </pre>
                    </details>
                  </div>
                )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-secondary">Presentation</legend>
            <div className="flex gap-2">
              <Button
                aria-pressed={reportPresentationDraft === "table"}
                onClick={() => {
                  setReportPresentationDraft("table");
                }}
                size="sm"
                variant={reportPresentationDraft === "table" ? "primary" : "secondary"}
              >
                Table
              </Button>
              <Button
                aria-pressed={reportPresentationDraft === "chart"}
                onClick={() => {
                  setReportPresentationDraft("chart");
                }}
                size="sm"
                variant={reportPresentationDraft === "chart" ? "primary" : "secondary"}
              >
                Chart
              </Button>
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => {
                if (selectedReport === undefined) return;
                setSelectedReportId(null);
                setReportPendingRemovalId(selectedReport.id);
              }}
              size="sm"
              variant="destructive-outline"
            >
              Remove report
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button onClick={cancelReportConfiguration} size="sm" variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={draftQueryTrimmed.length === 0 || previewRunning}
                iconProps={{ name: "play", size: "sm" }}
                onClick={runDraftPreview}
                size="sm"
                variant="secondary"
              >
                {previewRunning ? "Running…" : "Run preview"}
              </Button>
              <Button
                disabled={
                  reportNameDraft.trim().length === 0 ||
                  draftQueryTrimmed.length === 0 ||
                  previewRunning ||
                  !previewMatchesDraft
                }
                onClick={saveReportConfiguration}
                size="sm"
                title={
                  previewMatchesDraft
                    ? "Save this previewed draft"
                    : "Run the draft preview successfully before saving"
                }
              >
                Save
              </Button>
            </div>
            {!previewMatchesDraft && draftQueryTrimmed.length > 0 && (
              <p className="text-xs text-secondary">
                Run the exact draft preview successfully before saving. Saving keeps the card&apos;s
                last result until the new query loads.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        ariaLabelledby="remove-report-title"
        id="remove-report-dialog"
        onClose={() => {
          setReportPendingRemovalId(null);
        }}
        open={reportPendingRemoval !== undefined}
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-0 shadow-border-xs"
      >
        <div className="space-y-3 p-4">
          <h2 id="remove-report-title" className="text-sm font-semibold text-primary">
            Remove report?
          </h2>
          <p className="text-sm text-secondary">
            {reportPendingRemoval === undefined
              ? "This report card will be removed."
              : `${reportPendingRemoval.name} and its saved layout will be removed.`}
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex min-h-8 items-center rounded-lg border border-secondary bg-container px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-surface-hover focus-ring"
              onClick={() => {
                setReportPendingRemovalId(null);
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-8 items-center rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-inverse transition-opacity hover:opacity-90 focus-ring"
              onClick={removeReport}
              type="button"
            >
              Remove report
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
            Your dashboards, report cards, and layouts will be replaced. This only affects your
            dashboard view in this browser.
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
              onClick={resetStarterDashboard}
              className="inline-flex min-h-8 items-center rounded-lg button-bg-primary px-2.5 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover focus-ring"
            >
              Reset dashboard
            </button>
          </div>
        </div>
      </Modal>

      <div ref={containerRef} className="min-w-0">
        {activeDashboard === undefined ? (
          <section className="flex flex-col items-center justify-center rounded-xl bg-container px-6 py-24 text-center shadow-border-xs">
            <p className="font-medium text-primary">No dashboards yet</p>
            <p className="mt-1 max-w-sm text-sm text-secondary">
              Create a dashboard to run SureQL queries against your live data.
            </p>
            <button
              className="mt-4 inline-flex min-h-8 items-center gap-1.5 rounded-lg button-bg-primary px-2.5 py-1.5 text-xs font-medium text-inverse transition-colors hover:button-bg-primary-hover focus-ring"
              onClick={createDashboard}
              type="button"
            >
              <Icon name="plus" size="sm" />
              Create dashboard
            </button>
          </section>
        ) : activeDashboard.reports.length === 0 ? (
          <section className="flex flex-col items-center justify-center rounded-xl bg-container px-6 py-24 text-center shadow-border-xs">
            <p className="font-medium text-primary">No reports yet</p>
            <p className="mt-1 max-w-sm text-sm text-secondary">
              Add a table or chart report to run a SureQL query against your live data.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                onClick={() => {
                  addReport("table");
                }}
                size="sm"
              >
                Add table
              </Button>
              <Button
                onClick={() => {
                  addReport("chart");
                }}
                size="sm"
                variant="secondary"
              >
                Add chart
              </Button>
            </div>
          </section>
        ) : (
          <GridLayout
            width={gridWidth}
            layout={activeDashboard.layout}
            onLayoutChange={(nextLayout) => {
              setSnapshot((current) => ({
                dashboards: current.dashboards.map((dashboard) =>
                  dashboard.id === activeDashboard.id
                    ? { ...dashboard, layout: nextLayout }
                    : dashboard,
                ),
              }));
            }}
            onDragStop={handleInteractionStop}
            onResizeStop={handleInteractionStop}
            gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12] }}
            dragConfig={{ enabled: true, handle: "[data-report-drag-handle]" }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
          >
            {activeDashboard.reports.map((report) => (
              <div key={report.id}>
                <ReportCard
                  endpoint={bootstrap.apiPaths.sureqlRun}
                  onConfigure={() => {
                    openReportDialog(report);
                  }}
                  report={report}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}
