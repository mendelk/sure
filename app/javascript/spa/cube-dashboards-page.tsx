/* eslint-disable import/max-dependencies -- Route composes existing dashboard primitives and Cube modules. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { GridLayout, useContainerWidth, type EventCallback } from "react-grid-layout";
// eslint-disable-next-line import/no-unassigned-import -- vendor grid stylesheet
import "react-grid-layout/css/styles.css";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { DashboardSwitcher } from "./dashboard-switcher";
import { generateDashboardId } from "./dashboard-storage";
import { Icon } from "./icon";
import { Modal } from "./modal";
import { cubeErrorText, executeCubeQuery, fetchCubeCatalog } from "./api/cube";
import {
  cubeQuery,
  loadCubeSnapshot,
  normalizeCubeLayout,
  writeCubeSnapshot,
  type CubeDashboard,
  type CubeDashboardSnapshot,
  type CubeReport,
} from "./cube-dashboard-storage";
import { CubeReportConfigurator } from "./cube-report-configurator";
import { CubeReportResult } from "./cube-report-result";
import type { SpaBootstrap } from "./bootstrap";

function CubeReportCard({
  report,
  endpoint,
  userId,
  configured,
  text,
  onConfigure,
  onRemove,
}: {
  report: CubeReport;
  endpoint: string;
  userId: string;
  configured: boolean;
  text: Record<string, string>;
  onConfigure: () => void;
  onRemove: () => void;
}) {
  const query = cubeQuery(report.settings);
  const result = useQuery({
    queryKey: ["cube-report", userId, endpoint, report.id, query],
    queryFn: ({ signal }) => executeCubeQuery(endpoint, query, signal),
    enabled: configured,
    retry: false,
  });
  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-xl border border-secondary bg-container shadow-border-xs"
      aria-label={report.name}
    >
      <div className="flex items-center gap-2 border-b border-tertiary bg-surface-inset px-3 py-2">
        <div
          data-cube-report-drag-handle
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-secondary active:cursor-grabbing"
        >
          <Icon name="grip-horizontal" size="sm" />
          <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-primary">
            {report.name}
          </h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          iconProps={{ name: "sliders-horizontal", size: "sm" }}
          onClick={onConfigure}
          label={text.configure_report}
          labelClassName="hidden sm:inline"
          aria-label={`${text.configure_report}: ${report.name}`}
        />
        <IconButton
          icon="x"
          label={`${text.remove_report}: ${report.name}`}
          size="sm"
          onClick={onRemove}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {!configured ? (
          <output className="block text-sm text-secondary">{text.unavailable}</output>
        ) : result.isPending || result.isFetching ? (
          <output className="block text-sm text-secondary">{text.loading}</output>
        ) : result.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {cubeErrorText(result.error, text)}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void result.refetch();
              }}
            >
              {text.refresh}
            </Button>
          </div>
        ) : (
          <CubeReportResult
            result={result.data}
            settings={report.settings}
            name={report.name}
            text={text}
          />
        )}
      </div>
    </section>
  );
}

export function CubeDashboardsPage({
  dashboardId,
  reportId,
}: {
  dashboardId?: string;
  reportId?: string;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  return (
    <CubeDashboardWorkspace
      key={bootstrap.currentUser.id}
      bootstrap={bootstrap}
      dashboardId={dashboardId}
      reportId={reportId}
    />
  );
}

function CubeDashboardWorkspace({
  bootstrap,
  dashboardId,
  reportId,
}: {
  bootstrap: SpaBootstrap;
  dashboardId?: string;
  reportId?: string;
}) {
  const text = bootstrap.cubeDashboardText;
  const endpoint = bootstrap.apiPaths.cubeQuery;
  const userId = bootstrap.currentUser.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/cube-dashboards" });
  const search = useSearch({ from: "/cube-dashboards" });
  const [initial] = useState(() => loadCubeSnapshot(userId, text));
  const [snapshot, setSnapshot] = useState(initial.snapshot);
  const [stored, setStored] = useState(initial.stored);
  const [nameEditor, setNameEditor] = useState<{ id?: string; name: string } | null>(null);
  const [removal, setRemoval] = useState<{ dashboardId: string; reportId?: string } | null>(null);
  const { width, containerRef } = useContainerWidth({ measureBeforeMount: true });
  const catalog = useQuery({
    queryKey: ["cube-catalog", userId, endpoint],
    queryFn: ({ signal }) => fetchCubeCatalog(endpoint, signal),
    retry: false,
  });
  const requestedId = dashboardId ?? search.dashboard;
  const active =
    requestedId === undefined
      ? snapshot.dashboards[0]
      : snapshot.dashboards.find((dashboard) => dashboard.id === requestedId);
  const selectedReport = active?.reports.find((report) => report.id === reportId);
  const persist = (next: CubeDashboardSnapshot) => {
    setSnapshot(next);
    setStored(writeCubeSnapshot(userId, next));
  };
  const updateDashboard = (id: string, update: (dashboard: CubeDashboard) => CubeDashboard) => {
    persist({
      ...snapshot,
      dashboards: snapshot.dashboards.map((dashboard) =>
        dashboard.id === id ? update(dashboard) : dashboard,
      ),
    });
  };
  const selectDashboard = (id?: string) => {
    void navigate({ to: "/cube-dashboards", search: id === undefined ? {} : { dashboard: id } });
  };
  const configureReport = (id: string) => {
    if (active === undefined) return;
    void navigate({
      to: "/cube-dashboards/$dashboardId/reports/$reportId/configure",
      params: { dashboardId: active.id, reportId: id },
      search: {},
    });
  };
  const interactionStop: EventCallback = (layout) => {
    if (active !== undefined) {
      updateDashboard(active.id, (dashboard) => ({
        ...dashboard,
        layout: normalizeCubeLayout(layout, dashboard.reports),
      }));
    }
  };
  const pendingDashboard = snapshot.dashboards.find(
    (dashboard) => dashboard.id === removal?.dashboardId,
  );
  const pendingReport = pendingDashboard?.reports.find((report) => report.id === removal?.reportId);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
            {text.title}
          </p>
          {reportId !== undefined ? (
            <h1 className="text-2xl font-semibold text-primary">
              {selectedReport?.name ??
                (reportId === "new" ? text.new_report : text.configure_report)}
            </h1>
          ) : active ? (
            <DashboardSwitcher
              activeDashboardId={active.id}
              dashboards={snapshot.dashboards}
              onSelect={selectDashboard}
            />
          ) : (
            <h1 className="text-2xl font-semibold text-primary">{text.title}</h1>
          )}
          <p className="max-w-2xl text-sm text-secondary">{text.alternative}</p>
          <Link
            className="text-sm text-link hover:underline focus-ring"
            to="/dashboards"
            search={{}}
          >
            {text.original_dashboards}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {reportId !== undefined ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                selectDashboard(active?.id);
              }}
            >
              {text.back}
            </Button>
          ) : (
            <>
              {active ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setNameEditor({ id: active.id, name: active.name });
                    }}
                  >
                    {text.rename_dashboard}
                  </Button>
                  <IconButton
                    icon="x"
                    label={text.remove_dashboard}
                    size="sm"
                    onClick={() => {
                      setRemoval({ dashboardId: active.id });
                    }}
                  />
                  <Button
                    size="sm"
                    iconProps={{ name: "plus", size: "sm" }}
                    onClick={() => {
                      configureReport("new");
                    }}
                  >
                    {text.new_report}
                  </Button>
                </>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setNameEditor({ name: text.new_dashboard });
                }}
              >
                {text.new_dashboard}
              </Button>
              <IconButton
                icon="refresh-ccw"
                label={text.refresh}
                size="sm"
                disabled={catalog.isFetching}
                onClick={() => {
                  void catalog.refetch();
                  void queryClient.invalidateQueries({
                    queryKey: ["cube-report", userId, endpoint],
                  });
                }}
              />
            </>
          )}
        </div>
      </header>
      {!stored ? (
        <output className="block rounded-lg bg-warning/10 p-3 text-sm text-primary">
          {text.storage_unavailable}
        </output>
      ) : null}
      {catalog.isPending ? (
        <output className="block text-sm text-secondary">{text.loading}</output>
      ) : catalog.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary bg-container p-4">
          <p role="alert" className="text-sm text-destructive">
            {cubeErrorText(catalog.error, text)}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void catalog.refetch();
            }}
          >
            {text.refresh}
          </Button>
        </div>
      ) : !catalog.data.configured ? (
        <p
          role="alert"
          className="rounded-xl border border-secondary bg-container p-4 text-sm text-secondary"
        >
          {text.unavailable}
        </p>
      ) : null}
      {active === undefined ? (
        <section className="rounded-xl bg-container px-6 py-12 text-center text-secondary shadow-border-xs">
          {requestedId === undefined ? text.empty_dashboards : text.missing_dashboard}
          {requestedId !== undefined ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  selectDashboard();
                }}
              >
                {text.back}
              </Button>
            </div>
          ) : null}
        </section>
      ) : reportId !== undefined ? (
        selectedReport !== undefined || reportId === "new" ? (
          <CubeReportConfigurator
            key={`${active.id}:${reportId}`}
            report={selectedReport}
            endpoint={endpoint}
            userId={userId}
            catalog={catalog.data}
            text={text}
            onCancel={() => {
              selectDashboard(active.id);
            }}
            onRemove={
              selectedReport
                ? () => {
                    setRemoval({ dashboardId: active.id, reportId: selectedReport.id });
                  }
                : undefined
            }
            onSave={(name, settings) => {
              const report: CubeReport = {
                id: selectedReport?.id ?? generateDashboardId(),
                name,
                settings,
              };
              updateDashboard(active.id, (dashboard) => {
                const reports = selectedReport
                  ? dashboard.reports.map((saved) => (saved.id === report.id ? report : saved))
                  : [...dashboard.reports, report];
                return {
                  ...dashboard,
                  reports,
                  layout: normalizeCubeLayout(dashboard.layout, reports),
                };
              });
              selectDashboard(active.id);
            }}
          />
        ) : (
          <p role="alert" className="rounded-xl bg-container p-6 text-secondary">
            {text.missing_report}
          </p>
        )
      ) : (
        <div ref={containerRef} className="min-w-0">
          {active.reports.length === 0 ? (
            <section className="rounded-xl bg-container px-6 py-12 text-center text-secondary shadow-border-xs">
              <p>{text.empty_reports}</p>
              <Button
                className="mt-4"
                size="sm"
                onClick={() => {
                  configureReport("new");
                }}
              >
                {text.new_report}
              </Button>
            </section>
          ) : width > 0 ? (
            <GridLayout
              width={width}
              layout={active.layout}
              onLayoutChange={(layout) => {
                setSnapshot((current) => ({
                  ...current,
                  dashboards: current.dashboards.map((dashboard) =>
                    dashboard.id === active.id ? { ...dashboard, layout } : dashboard,
                  ),
                }));
              }}
              onDragStop={interactionStop}
              onResizeStop={interactionStop}
              gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12] }}
              dragConfig={{ enabled: true, handle: "[data-cube-report-drag-handle]" }}
              resizeConfig={{ enabled: true, handles: ["se"] }}
            >
              {active.reports.map((report) => (
                <div key={report.id}>
                  <CubeReportCard
                    report={report}
                    endpoint={endpoint}
                    userId={userId}
                    configured={catalog.data?.configured === true && !catalog.isError}
                    text={text}
                    onConfigure={() => {
                      configureReport(report.id);
                    }}
                    onRemove={() => {
                      setRemoval({ dashboardId: active.id, reportId: report.id });
                    }}
                  />
                </div>
              ))}
            </GridLayout>
          ) : (
            <output className="block text-secondary">{text.loading}</output>
          )}
        </div>
      )}
      <Modal
        open={nameEditor !== null}
        onClose={() => {
          setNameEditor(null);
        }}
        ariaLabelledby="cube-dashboard-name-title"
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameEditor === null || !nameEditor.name.trim()) return;
            const name = nameEditor.name.trim();
            if (nameEditor.id !== undefined)
              updateDashboard(nameEditor.id, (dashboard) => ({ ...dashboard, name }));
            else {
              const dashboard: CubeDashboard = {
                id: generateDashboardId(),
                name,
                reports: [],
                layout: [],
              };
              persist({ ...snapshot, dashboards: [...snapshot.dashboards, dashboard] });
              selectDashboard(dashboard.id);
            }
            setNameEditor(null);
          }}
        >
          <h2 id="cube-dashboard-name-title" className="text-sm font-semibold text-primary">
            {nameEditor?.id !== undefined ? text.rename_dashboard : text.new_dashboard}
          </h2>
          <FormField
            id="cube-dashboard-name"
            label={text.dashboard_name}
            required
            value={nameEditor?.name ?? ""}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setNameEditor((current) => (current === null ? null : { ...current, name }));
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNameEditor(null);
              }}
            >
              {text.cancel}
            </Button>
            <Button size="sm" type="submit" disabled={(nameEditor?.name.trim().length ?? 0) === 0}>
              {nameEditor?.id !== undefined ? text.save : text.create}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={removal !== null}
        onClose={() => {
          setRemoval(null);
        }}
        ariaLabelledby="cube-removal-title"
        panelClassName="w-full max-w-sm rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
      >
        <div className="space-y-4">
          <h2 id="cube-removal-title" className="text-sm font-semibold text-primary">
            {removal?.reportId !== undefined
              ? text.confirm_remove_report
              : text.confirm_remove_dashboard}
          </h2>
          <p className="text-sm text-secondary">{pendingReport?.name ?? pendingDashboard?.name}</p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setRemoval(null);
              }}
            >
              {text.cancel}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (removal === null) return;
                if (removal.reportId !== undefined) {
                  updateDashboard(removal.dashboardId, (dashboard) => {
                    const reports = dashboard.reports.filter(
                      (report) => report.id !== removal.reportId,
                    );
                    return {
                      ...dashboard,
                      reports,
                      layout: normalizeCubeLayout(dashboard.layout, reports),
                    };
                  });
                  if (reportId !== undefined) selectDashboard(removal.dashboardId);
                } else {
                  const dashboards = snapshot.dashboards.filter(
                    (dashboard) => dashboard.id !== removal.dashboardId,
                  );
                  persist({ ...snapshot, dashboards });
                  selectDashboard(dashboards[0]?.id);
                }
                setRemoval(null);
              }}
            >
              {text.remove}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
