import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { appendDashboardVisualization, type DashboardLayoutData } from "./dashboard-storage";
import { useDashboardWorkspace } from "./dashboard-workspace";
import {
  DashboardIdSchema,
  LayoutItemIdSchema,
  SourceIdSchema,
  type DashboardId,
  type LayoutItemId,
  type SourceId,
} from "./ids";
import type { Source } from "./source";
import { SourceEditor } from "./source-editor";

export type SourceReturnSearch = {
  dashboard?: DashboardId;
  component?: LayoutItemId;
  add?: "Table" | "Chart";
  layout?: boolean;
};

export function validateSourceReturnSearch(input: Record<string, unknown>): SourceReturnSearch {
  const search: SourceReturnSearch = {};
  const dashboard = DashboardIdSchema.safeParse(input.dashboard);
  if (dashboard.success) search.dashboard = dashboard.data;
  const component = LayoutItemIdSchema.safeParse(input.component);
  if (component.success) search.component = component.data;
  if (input.add === "Table" || input.add === "Chart") search.add = input.add;
  if (input.layout === true || input.layout === "true") search.layout = true;
  return search;
}

export function SourcesPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const { snapshot } = useDashboardWorkspace();
  const t = (key: string) => bootstrap.reportBuilderText[key];
  return (
    <section aria-labelledby="sources-title" className="space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 id="sources-title" className="text-2xl font-semibold tracking-tight text-primary">
          {t("sources")}
        </h1>
        <Link
          to="/sources/new"
          search={{}}
          className="inline-flex h-10 items-center justify-center rounded-lg button-bg-primary px-4 text-sm font-medium text-inverse hover:button-bg-primary-hover focus-ring"
        >
          {t("create_source")}
        </Link>
      </header>
      {snapshot.sources.length === 0 ? (
        <p className="text-sm text-secondary">{t("source_no_sources")}</p>
      ) : (
        <ul className="rounded-xl border border-primary bg-container">
          {snapshot.sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-primary p-4 last:border-b-0"
            >
              <div className="min-w-0 space-y-1">
                <h2 className="wrap-break-word font-medium text-primary">{source.name}</h2>
                <p className="text-sm text-secondary">
                  {t(
                    source.configuration.kind === "sureql" ? "source_sureql" : "source_structured",
                  )}
                  {source.configuration.kind === "structured" && (
                    <>
                      {" · "}
                      {t(
                        source.configuration.definition.mode === "aggregate"
                          ? "source_mode_aggregate"
                          : "source_mode_detail",
                      )}
                    </>
                  )}
                </p>
              </div>
              <Link
                to="/sources/$sourceId/edit"
                params={{ sourceId: source.id }}
                search={{}}
                aria-label={t("source_edit_label").replace("%{name}", source.name)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-surface-hover focus-ring"
              >
                {t("edit_source")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewSourcePage() {
  return <SourcePage />;
}

export function EditSourcePage() {
  const { sourceId } = useParams({ from: "/sources/$sourceId/edit" });
  const { snapshot } = useDashboardWorkspace();
  const parsedId = SourceIdSchema.safeParse(sourceId);
  const source = parsedId.success
    ? snapshot.sources.find((candidate) => candidate.id === parsedId.data)
    : undefined;
  if (source === undefined) return <SourceNotFound />;
  return <SourcePage key={source.id} source={source} />;
}

function SourceNotFound() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const t = (key: string) => bootstrap.reportBuilderText[key];
  return (
    <section aria-labelledby="source-not-found-title" className="space-y-4">
      <h1 id="source-not-found-title" className="text-2xl font-semibold text-primary">
        {t("source_not_found")}
      </h1>
      <p className="text-sm text-secondary">{t("source_not_found_help")}</p>
      <Link to="/sources" search={{}} className="text-sm text-primary underline focus-ring">
        {t("source_back_to_sources")}
      </Link>
    </section>
  );
}

function SourcePage({ source }: { source?: Source }) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const search = useSearch({ from: "/sources" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { updateSnapshot, layoutDrafts, setLayoutDraft } = useDashboardWorkspace();
  const { dashboard: dashboardId, component: componentId, add } = search;
  const returnToOrigin = () => {
    if (dashboardId !== undefined) {
      void navigate({
        to: "/dashboards",
        search: {
          dashboard: dashboardId,
          ...(search.layout === true || componentId !== undefined ? { layout: true } : {}),
          ...(componentId !== undefined ? { component: componentId } : {}),
        },
      });
    } else void navigate({ to: "/sources", search: {} });
  };
  const saveSource = async (nextSource: Source) => {
    await queryClient.cancelQueries({ queryKey: ["source", nextSource.id] });
    queryClient.removeQueries({ queryKey: ["source", nextSource.id] });
    updateSnapshot((current) => ({
      ...current,
      sources: current.sources.some((existing) => existing.id === nextSource.id)
        ? current.sources.map((existing) => (existing.id === nextSource.id ? nextSource : existing))
        : [...current.sources, nextSource],
      dashboards:
        source === undefined && dashboardId !== undefined && add !== undefined
          ? current.dashboards.map((dashboard) =>
              dashboard.id === dashboardId
                ? {
                    ...dashboard,
                    layout: appendDashboardVisualization(dashboard.layout, add, nextSource.id),
                  }
                : dashboard,
            )
          : current.dashboards,
    }));
    // Only creation selects a new source. Editing changes the shared configuration,
    // never a consumer's presentation or source selection.
    if (source === undefined && dashboardId !== undefined && componentId !== undefined) {
      const draft = layoutDrafts[dashboardId];
      if (draft !== undefined) {
        const content = selectComponentSource(draft.content, componentId, nextSource.id);
        if (content !== draft.content) setLayoutDraft(dashboardId, { ...draft, content });
      }
    }
    returnToOrigin();
  };
  return (
    <SourceEditor
      source={source}
      endpoint={bootstrap.apiPaths.sureqlRun}
      text={bootstrap.reportBuilderText}
      onSave={saveSource}
      onCancel={returnToOrigin}
    />
  );
}

function selectComponentSource(
  content: DashboardLayoutData["content"],
  componentId: LayoutItemId,
  sourceId: SourceId,
): DashboardLayoutData["content"] {
  const next = content.map((item): DashboardLayoutData["content"][number] => {
    if (item.type === "Table" && item.props.id === componentId)
      return { ...item, props: { ...item.props, sourceId } };
    if (item.type === "Chart" && item.props.id === componentId)
      return { ...item, props: { ...item.props, sourceId } };
    if (item.type === "Grid" || item.type === "GridItem") {
      const children = selectComponentSource(item.props.content, componentId, sourceId);
      if (children !== item.props.content) {
        return item.type === "Grid"
          ? { ...item, props: { ...item.props, content: children } }
          : { ...item, props: { ...item.props, content: children } };
      }
    }
    return item;
  });
  return next.every((item, index) => item === content[index]) ? content : next;
}
