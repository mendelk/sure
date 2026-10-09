/* eslint-disable import/max-dependencies -- Route composes dashboard persistence, source editing, and UI primitives. */
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { IconButton } from "./components/icon-button";
import { Modal } from "./modal";
import { DashboardSwitcher } from "./dashboard-switcher";
import { DashboardLayout, DashboardLayoutEditor } from "./dashboard-layout";
import { SourcePicker } from "./source-picker";
import type { Source } from "./source";
import { useDashboardWorkspace } from "./dashboard-workspace";
import type { DashboardId, LayoutItemId, SourceId } from "./ids";
import type { SourceReturnSearch } from "./source-pages";
import {
  appendDashboardVisualization,
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
  const {
    snapshot,
    updateSnapshot: persistSnapshot,
    layoutDrafts,
    setLayoutDraft,
  } = useDashboardWorkspace();
  const activeDashboard = selectActiveDashboard(snapshot, routeSearch.dashboard);
  const text = bootstrap.reportBuilderText;
  const t = (key: string) => text[key];
  const [titleEditor, setTitleEditor] = useState<{ id: DashboardId; draft: string } | null>(null);
  const [pendingVisualization, setPendingVisualization] = useState<"Table" | "Chart" | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | "">("");
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
    setLayoutDraft(activeDashboard.id, null);
    setDeleteDialogOpen(false);
    setTitleEditor(null);
    const next = remaining.at(0);
    if (next !== undefined) switchDashboard(next.id);
    else void navigate({ to: "/dashboards", search: {} });
  };
  const addVisualization = (type: "Table" | "Chart", source: Source) => {
    updateActiveDashboard((dashboard) => ({
      ...dashboard,
      layout: appendDashboardVisualization(dashboard.layout, type, source.id),
    }));
    setPendingVisualization(null);
  };
  // Draft updates must not rebuild Puck's config and remount inline RichText editors.
  const createSource = useCallback(
    (componentId?: LayoutItemId) => {
      const search: SourceReturnSearch =
        activeDashboard === undefined ? {} : { dashboard: activeDashboard.id };
      if (componentId !== undefined) {
        search.component = componentId;
        search.layout = true;
      }
      void navigate({ to: "/sources/new", search });
    },
    [activeDashboard, navigate],
  );
  const editSource = useCallback(
    (source: Source) => {
      void navigate({
        to: "/sources/$sourceId/edit",
        params: { sourceId: source.id },
        search:
          activeDashboard === undefined
            ? {}
            : {
                dashboard: activeDashboard.id,
                ...(routeSearch.layout === true ? { layout: true } : {}),
              },
      });
    },
    [activeDashboard, navigate, routeSearch.layout],
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
      {activeDashboard !== undefined && routeSearch.layout === true ? (
        <DashboardLayoutEditor
          key={activeDashboard.id}
          dashboard={{
            ...activeDashboard,
            layout: layoutDrafts[activeDashboard.id] ?? activeDashboard.layout,
          }}
          {...layoutProps}
          initialComponentId={routeSearch.component}
          onDraftChange={(layout) => {
            setLayoutDraft(activeDashboard.id, layout);
          }}
          onCancel={() => {
            setLayoutDraft(activeDashboard.id, null);
            switchDashboard(activeDashboard.id);
          }}
          onSave={(layout) => {
            updateActiveDashboard((dashboard) => ({ ...dashboard, layout }));
            setLayoutDraft(activeDashboard.id, null);
            switchDashboard(activeDashboard.id);
          }}
        />
      ) : (
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
              {activeDashboard !== undefined && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setLayoutDraft(activeDashboard.id, activeDashboard.layout);
                    void navigate({
                      to: "/dashboards",
                      search: { dashboard: activeDashboard.id, layout: true },
                    });
                  }}
                >
                  {t("edit_layout")}
                </Button>
              )}
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
                      setSelectedSourceId("");
                      setPendingVisualization("Table");
                    }}
                  >
                    {t("source_add_table")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedSourceId("");
                      setPendingVisualization("Chart");
                    }}
                  >
                    {t("source_add_chart")}
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
          ) : activeDashboard.layout.content.every(
              (item) => item.type === "Grid" && item.props.content.length === 0,
            ) ? (
            <section className="rounded-xl bg-container px-6 py-12 text-center shadow-border-xs">
              <p className="font-medium text-primary">{t("source_no_visualizations")}</p>
              <p className="mt-1 text-sm text-secondary">{t("source_add_help")}</p>
            </section>
          ) : (
            <DashboardLayout dashboard={activeDashboard} {...layoutProps} />
          )}
        </div>
      )}
      <Modal
        open={pendingVisualization !== null}
        onClose={() => {
          setPendingVisualization(null);
        }}
        id="source-picker-dialog"
        ariaLabelledby="source-picker-title"
        panelClassName="w-full max-w-md space-y-4 rounded-xl border border-secondary bg-container p-4 shadow-border-xs"
      >
        <h2 id="source-picker-title" className="text-xl font-semibold text-primary">
          {pendingVisualization === "Chart" ? t("source_add_chart") : t("source_add_table")}
        </h2>
        <SourcePicker
          sources={snapshot.sources}
          text={text}
          value={selectedSourceId}
          onChange={setSelectedSourceId}
          onCreateSource={() => {
            if (activeDashboard !== undefined && pendingVisualization !== null) {
              void navigate({
                to: "/sources/new",
                search: { dashboard: activeDashboard.id, add: pendingVisualization },
              });
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setPendingVisualization(null);
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!snapshot.sources.some((source) => source.id === selectedSourceId)}
            onClick={() => {
              const source = snapshot.sources.find((item) => item.id === selectedSourceId);
              if (source && pendingVisualization) addVisualization(pendingVisualization, source);
            }}
          >
            {t("use_source")}
          </Button>
        </div>
      </Modal>
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
              for (const dashboard of snapshot.dashboards) setLayoutDraft(dashboard.id, null);
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
