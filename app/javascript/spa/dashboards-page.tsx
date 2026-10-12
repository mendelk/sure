/* eslint-disable import/max-dependencies -- Route composes dashboard persistence, source editing, and UI primitives. */
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Modal } from "./modal";
import { DashboardSwitcher } from "./dashboard-switcher";
import { DashboardLayout } from "./dashboard-layout";
import type { Source } from "./source";
import { useDashboardWorkspace } from "./dashboard-workspace";
import type { DashboardId, LayoutItemId } from "./ids";
import type { SourceReturnSearch } from "./source-pages";
import {
  emptyDashboardLayout,
  generateDashboardId,
  selectActiveDashboard,
  starterSnapshot,
  type Dashboard,
} from "./dashboard-storage";

export function DashboardsPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const routeSearch = useSearch({ from: "/dashboards" });
  const navigate = useNavigate({ from: "/dashboards" });
  const { snapshot, updateSnapshot: persistSnapshot } = useDashboardWorkspace();
  const activeDashboard = selectActiveDashboard(snapshot, routeSearch.dashboard);
  const text = bootstrap.reportBuilderText;
  const t = (key: string) => text[key];
  const [titleEditor, setTitleEditor] = useState<{ id: DashboardId; draft: string } | null>(null);
  const [addingDashboardId, setAddingDashboardId] = useState<DashboardId>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const updateActiveDashboard = (update: (dashboard: Dashboard) => Dashboard) => {
    if (activeDashboard === undefined) return;
    persistSnapshot((current) => ({
      ...current,
      dashboards: current.dashboards.map((dashboard) =>
        dashboard.id === activeDashboard.id ? update(dashboard) : dashboard,
      ),
    }));
  };
  const switchDashboard = (dashboardId: DashboardId) => {
    setAddingDashboardId(undefined);
    void navigate({ to: "/dashboards", search: { dashboard: dashboardId } });
  };
  const createDashboard = () => {
    const dashboard: Dashboard = {
      id: generateDashboardId(),
      name: t("source_untitled_dashboard").replace(
        "%{count}",
        String(snapshot.dashboards.length + 1),
      ),
      layout: emptyDashboardLayout(),
    };
    persistSnapshot((current) => ({ ...current, dashboards: [...current.dashboards, dashboard] }));
    setTitleEditor({ id: dashboard.id, draft: dashboard.name });
    switchDashboard(dashboard.id);
  };
  const saveDashboardName = () => {
    if (titleEditor === null || activeDashboard?.id !== titleEditor.id || !titleEditor.draft.trim())
      return;
    const name = titleEditor.draft.trim();
    updateActiveDashboard((dashboard) => ({ ...dashboard, name }));
    setTitleEditor(null);
  };
  const deleteDashboard = () => {
    if (activeDashboard === undefined) return;
    const remaining = snapshot.dashboards.filter(
      (dashboard) => dashboard.id !== activeDashboard.id,
    );
    persistSnapshot((current) => ({
      ...current,
      dashboards: current.dashboards.filter((dashboard) => dashboard.id !== activeDashboard.id),
    }));
    setDeleteDialogOpen(false);
    setTitleEditor(null);
    const next = remaining.at(0);
    if (next !== undefined) switchDashboard(next.id);
    else void navigate({ to: "/dashboards", search: {} });
  };
  const createSource = useCallback(
    (componentId?: LayoutItemId) => {
      const search: SourceReturnSearch =
        activeDashboard === undefined ? {} : { dashboard: activeDashboard.id };
      if (componentId !== undefined) search.component = componentId;
      void navigate({ to: "/sources/new", search });
    },
    [activeDashboard, navigate],
  );
  const editSource = useCallback(
    (source: Source, componentId?: LayoutItemId) => {
      void navigate({
        to: "/sources/$sourceId/edit",
        params: { sourceId: source.id },
        search:
          activeDashboard === undefined
            ? {}
            : {
                dashboard: activeDashboard.id,
                ...(componentId !== undefined ? { component: componentId } : {}),
              },
      });
    },
    [activeDashboard, navigate],
  );
  const layoutProps = {
    sources: snapshot.sources,
    endpoint: bootstrap.apiPaths.sureqlRun,
    text,
    onCreateSource: createSource,
    onEditSource: editSource,
  };
  return (
    <>
      <div className="space-y-6 pb-12">
        <header className="flex flex-wrap items-start justify-between gap-3">
          {activeDashboard !== undefined && (
            <div className="flex items-center gap-2">
              {titleEditor?.id === activeDashboard.id ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveDashboardName();
                  }}
                >
                  <FormField
                    aria-label={t("source_dashboard_name")}
                    autoComplete="off"
                    containerClassName="w-64"
                    id="dashboard-name"
                    maxLength={80}
                    required
                    value={titleEditor.draft}
                    onChange={(event) => {
                      setTitleEditor({ id: titleEditor.id, draft: event.currentTarget.value });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setTitleEditor(null);
                    }}
                    ref={(element) => {
                      element?.focus();
                    }}
                  />
                  <IconButton
                    label={t("source_save_dashboard_name")}
                    icon="check"
                    size="sm"
                    type="submit"
                  />
                  <IconButton
                    label={t("source_cancel_dashboard_name")}
                    icon="x"
                    size="sm"
                    onClick={() => {
                      setTitleEditor(null);
                    }}
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
                    label={t("source_rename_dashboard")}
                    icon="pencil"
                    size="sm"
                    onClick={() => {
                      setTitleEditor({ id: activeDashboard.id, draft: activeDashboard.name });
                    }}
                  />
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigate({ to: "/sources", search: {} });
              }}
            >
              {t("sources")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                createSource();
              }}
            >
              {t("create_source")}
            </Button>
            <Button size="sm" onClick={createDashboard}>
              {t("source_new_dashboard")}
            </Button>
            {activeDashboard !== undefined && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setAddingDashboardId(activeDashboard.id);
                    void navigate({
                      to: "/dashboards",
                      search: { dashboard: activeDashboard.id },
                    });
                  }}
                >
                  {t("layout_add_item")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive-outline"
                  onClick={() => {
                    setDeleteDialogOpen(true);
                  }}
                >
                  {t("source_delete_dashboard")}
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setResetDialogOpen(true);
              }}
            >
              {t("source_reset_starter")}
            </Button>
          </div>
        </header>
        {activeDashboard === undefined ? (
          <section className="rounded-xl bg-container px-6 py-12 text-center shadow-border-xs">
            <p className="font-medium text-primary">{t("source_no_dashboards")}</p>
          </section>
        ) : (
          <>
            {activeDashboard.layout.content.length === 0 && (
              <p className="text-sm text-secondary">{t("source_no_visualizations")}</p>
            )}
            <DashboardLayout
              key={activeDashboard.id}
              dashboard={activeDashboard}
              {...layoutProps}
              selectedId={routeSearch.component}
              adding={addingDashboardId === activeDashboard.id}
              onSelect={(component) => {
                setAddingDashboardId(undefined);
                void navigate({
                  to: "/dashboards",
                  search: {
                    dashboard: activeDashboard.id,
                    ...(component !== undefined ? { component } : {}),
                  },
                });
              }}
              onChange={(layout) => {
                updateActiveDashboard((dashboard) => ({ ...dashboard, layout }));
              }}
            />
          </>
        )}
      </div>
      <Modal
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
        id="delete-dashboard-dialog"
        ariaLabelledby="delete-dashboard-title"
        panelClassName="w-full max-w-sm space-y-3 rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
      >
        <h2 id="delete-dashboard-title" className="font-semibold text-primary">
          {t("source_delete_dashboard_title")}
        </h2>
        <p className="text-sm text-secondary">{t("source_delete_dashboard_help")}</p>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDeleteDialogOpen(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button size="sm" variant="destructive" onClick={deleteDashboard}>
            {t("source_delete_dashboard")}
          </Button>
        </div>
      </Modal>
      <Modal
        open={resetDialogOpen}
        onClose={() => {
          setResetDialogOpen(false);
        }}
        id="reset-starter-dialog"
        ariaLabelledby="reset-starter-title"
        panelClassName="w-full max-w-sm space-y-3 rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
      >
        <h2 id="reset-starter-title" className="font-semibold text-primary">
          {t("source_reset_title")}
        </h2>
        <p className="text-sm text-secondary">{t("source_reset_help")}</p>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setResetDialogOpen(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const starter = starterSnapshot();
              persistSnapshot(() => starter);
              setResetDialogOpen(false);
              setTitleEditor(null);
              void navigate({ to: "/dashboards", search: {} });
            }}
          >
            {t("source_reset_dashboard")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
