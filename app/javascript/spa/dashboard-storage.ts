import type { RichText } from "@puckeditor/core";
import * as z from "zod/mini";
import {
  AggregateReportDefinitionSchema,
  DetailReportColumnSchema,
  DetailReportDefinitionSchema,
  DetailReportSortSchema,
  ReportDefinitionSchema,
  ReportDimensionSchema,
  ReportFilterSchema,
  ReportSortSchema,
  ReportValueSchema,
} from "./report-definition";
import { generateSourceId, type Source } from "./source";
import {
  SourceIdSchema,
  DashboardIdSchema,
  LayoutItemIdSchema,
  ReportDimensionIdSchema,
  ReportMeasureIdSchema,
  type SourceId,
  type DashboardId,
  type LayoutItemId,
  type UserId,
} from "./ids";

export const STARTER_QUERY = "from transactions\nsort {-date}\ntake 10";

export type DashboardLayoutProps = {
  Grid: { id: LayoutItemId; content: DashboardLayoutContent };
  GridItem: {
    id: LayoutItemId;
    content: DashboardLayoutContent;
    columnSpan: number;
    height: number | "auto";
  };
  Table: { id: LayoutItemId; sourceId?: SourceId; visibleColumns: string[] };
  Chart: {
    id: LayoutItemId;
    sourceId?: SourceId;
    chartType: "line" | "bar" | "pie";
    categoryField: string;
    valueField: string;
  };
  RichText: { id: LayoutItemId; sourceId?: SourceId; content: RichText };
};

export type DashboardLayoutContent = {
  [Type in keyof DashboardLayoutProps]: { type: Type; props: DashboardLayoutProps[Type] };
}[keyof DashboardLayoutProps][];

// Keep domain IDs intact: Puck's recursive mapped types turn branded strings into objects.
export type DashboardLayoutData = {
  root: { props: Record<string, never> };
  content: DashboardLayoutContent;
};

export interface Dashboard {
  id: DashboardId;
  name: string;
  layout: DashboardLayoutData;
}

export interface DashboardSnapshot {
  formatVersion: 6;
  sources: Source[];
  dashboards: Dashboard[];
}

export function emptyDashboardLayout(): DashboardLayoutData {
  return {
    root: { props: {} },
    content: [],
  };
}

export function appendDashboardVisualization(
  layout: DashboardLayoutData,
  type: "Table" | "Chart",
  sourceId: SourceId,
): DashboardLayoutData {
  const grid = layout.content.find((item) => item.type === "Grid");
  const ids = new Set<string>();
  collectLayoutIds(layout.content, ids);
  const baseId = `grid-item-${type.toLowerCase()}`;
  let id = baseId;
  let suffix = 2;
  while (ids.has(id) || ids.has(`${id}-visualization`)) id = `${baseId}-${suffix++}`;
  const visualization: DashboardLayoutData["content"][number] =
    type === "Table"
      ? {
          type,
          props: {
            id: LayoutItemIdSchema.parse(`${id}-visualization`),
            sourceId,
            visibleColumns: [],
          },
        }
      : {
          type,
          props: {
            id: LayoutItemIdSchema.parse(`${id}-visualization`),
            sourceId,
            chartType: "line",
            categoryField: "",
            valueField: "",
          },
        };
  if (grid === undefined) return { ...layout, content: [...layout.content, visualization] };
  return {
    ...layout,
    content: layout.content.map((item) =>
      item === grid
        ? {
            ...grid,
            props: {
              ...grid.props,
              content: [
                ...grid.props.content,
                {
                  type: "GridItem",
                  props: {
                    id: LayoutItemIdSchema.parse(id),
                    content: [visualization],
                    columnSpan: type === "Table" ? 12 : 4,
                    height: type === "Table" ? 4 : 5,
                  },
                },
              ],
            },
          }
        : item,
    ),
  };
}

function collectLayoutIds(content: DashboardLayoutData["content"], ids: Set<string>): void {
  for (const item of content) {
    ids.add(item.props.id);
    if (item.type === "Grid" || item.type === "GridItem") collectLayoutIds(item.props.content, ids);
  }
}

// Layout owns only presentation and references. The catalog is independently
// validated, so recursive slots cannot smuggle dashboard-owned query settings.
const DashboardContentSchema: z.ZodMiniType<DashboardLayoutData["content"][number]> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("Grid"),
      props: z.strictObject({ id: LayoutItemIdSchema, content: z.array(DashboardContentSchema) }),
    }),
    z.strictObject({
      type: z.literal("GridItem"),
      props: z.strictObject({
        id: LayoutItemIdSchema,
        content: z.array(DashboardContentSchema),
        columnSpan: z.int().check(z.minimum(1), z.maximum(12)),
        height: z.union([z.literal("auto"), z.int().check(z.minimum(3), z.maximum(12))]),
      }),
    }),
    z.strictObject({
      type: z.literal("Table"),
      props: z.strictObject({
        id: LayoutItemIdSchema,
        sourceId: z.optional(SourceIdSchema),
        visibleColumns: z.array(z.string()),
      }),
    }),
    z.strictObject({
      type: z.literal("Chart"),
      props: z.strictObject({
        id: LayoutItemIdSchema,
        sourceId: z.optional(SourceIdSchema),
        chartType: z.enum(["line", "bar", "pie"]),
        categoryField: z.string(),
        valueField: z.string(),
      }),
    }),
    z.strictObject({
      type: z.literal("RichText"),
      props: z.strictObject({
        id: LayoutItemIdSchema,
        sourceId: z.optional(SourceIdSchema),
        content: z.string(),
      }),
    }),
  ]),
);

export const DashboardLayoutSchema = z.strictObject({
  root: z.strictObject({ props: z.strictObject({}) }),
  content: z.array(DashboardContentSchema),
});

const NonEmptyStringSchema = z.string().check(z.refine((value) => value.trim().length > 0));
// API schemas accept response evolution by stripping unknown keys. Persisted
// configuration must instead reject unknown settings, including old pivot data.
const StrictReportDefinitionSchema = z
  .discriminatedUnion("mode", [
    z.strictObject({
      ...AggregateReportDefinitionSchema.shape,
      rows: z.array(z.strictObject(ReportDimensionSchema.shape)),
      columns: z.array(z.strictObject(ReportDimensionSchema.shape)),
      values: z.array(z.strictObject(ReportValueSchema.shape)),
      filters: z.array(z.strictObject(ReportFilterSchema.shape)),
      sort: z.array(z.strictObject(ReportSortSchema.shape)),
    }),
    z.strictObject({
      ...DetailReportDefinitionSchema.shape,
      columns: z.array(z.strictObject(DetailReportColumnSchema.shape)),
      filters: z.array(z.strictObject(ReportFilterSchema.shape)),
      sort: z.array(z.strictObject(DetailReportSortSchema.shape)),
    }),
  ])
  .check(z.refine((definition) => ReportDefinitionSchema.safeParse(definition).success));
const SourceSchema = z.strictObject({
  id: SourceIdSchema,
  name: NonEmptyStringSchema,
  configuration: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("structured"), definition: StrictReportDefinitionSchema }),
    z.strictObject({ kind: z.literal("sureql"), query: NonEmptyStringSchema }),
  ]),
});
const DashboardSchema = z.strictObject({
  id: DashboardIdSchema,
  name: NonEmptyStringSchema,
  layout: DashboardLayoutSchema,
});
const DashboardSnapshotSchema = z.strictObject({
  formatVersion: z.literal(6),
  sources: z.array(SourceSchema),
  dashboards: z.array(DashboardSchema),
});

export function generateDashboardId(): DashboardId {
  const parts = crypto.getRandomValues(new Uint32Array(4));
  return DashboardIdSchema.parse(
    `dashboard-${Array.from(parts, (part) => part.toString(16).padStart(8, "0")).join("")}`,
  );
}

export function starterSnapshot(): DashboardSnapshot {
  const transactionsId = generateSourceId();
  const spendingId = generateSourceId();
  return {
    formatVersion: 6,
    sources: [
      {
        id: transactionsId,
        name: "Recent transactions",
        configuration: { kind: "sureql", query: STARTER_QUERY },
      },
      {
        id: spendingId,
        name: "Spending by category (30 days)",
        configuration: {
          kind: "structured",
          definition: {
            version: 1,
            source: "transactions",
            mode: "aggregate",
            // The executor requires a row currency dimension for monetary
            // aggregates. Currency columns also expose each original unit.
            rows: [
              { id: ReportDimensionIdSchema.parse("category"), field: "category" },
              { id: ReportDimensionIdSchema.parse("row_currency"), field: "currency" },
            ],
            columns: [{ id: ReportDimensionIdSchema.parse("column_currency"), field: "currency" }],
            values: [
              { id: ReportMeasureIdSchema.parse("spending"), field: "amount", aggregation: "sum" },
            ],
            filters: [{ field: "date", operator: "last", value: 30, unit: "days" }],
            sort: [],
          },
        },
      },
    ],
    dashboards: [
      {
        id: DashboardIdSchema.parse("starter-dashboard"),
        name: "My dashboard",
        layout: {
          root: { props: {} },
          content: [
            {
              type: "Grid",
              props: {
                id: LayoutItemIdSchema.parse("dashboard-grid"),
                content: [
                  {
                    type: "GridItem",
                    props: {
                      id: LayoutItemIdSchema.parse("grid-item-transactions"),
                      content: [
                        {
                          type: "Table",
                          props: {
                            id: LayoutItemIdSchema.parse("transactions-table"),
                            sourceId: transactionsId,
                            visibleColumns: [],
                          },
                        },
                      ],
                      columnSpan: 12,
                      height: 4,
                    },
                  },
                  {
                    type: "GridItem",
                    props: {
                      id: LayoutItemIdSchema.parse("grid-item-spending"),
                      content: [
                        {
                          type: "Chart",
                          props: {
                            id: LayoutItemIdSchema.parse("spending-chart"),
                            sourceId: spendingId,
                            chartType: "pie",
                            categoryField: "",
                            valueField: "",
                          },
                        },
                      ],
                      columnSpan: 4,
                      height: 5,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };
}

export function dashboardStorageKey(userId: UserId): string {
  return `sure:dashboards:${userId}`;
}

// Keep the selected dashboard when possible, otherwise choose the first survivor.
export function selectActiveDashboard(
  snapshot: DashboardSnapshot,
  requestedId: DashboardId | undefined,
): Dashboard | undefined {
  return (
    snapshot.dashboards.find((dashboard) => dashboard.id === requestedId) ?? snapshot.dashboards[0]
  );
}

function validatedSnapshot(input: unknown): DashboardSnapshot | undefined {
  const result = DashboardSnapshotSchema.safeParse(input);
  if (!result.success) return undefined;
  const sourceIds = new Set<SourceId>();
  for (const source of result.data.sources) {
    if (sourceIds.has(source.id)) return undefined;
    sourceIds.add(source.id);
  }
  const dashboardIds = new Set<DashboardId>();
  for (const dashboard of result.data.dashboards) {
    if (dashboardIds.has(dashboard.id)) return undefined;
    dashboardIds.add(dashboard.id);
    if (!validLayoutContent(dashboard.layout.content, new Set(), sourceIds)) return undefined;
  }
  return result.data;
}

function validLayoutContent(
  content: DashboardLayoutData["content"],
  ids: Set<LayoutItemId>,
  sourceIds: Set<SourceId>,
): boolean {
  for (const item of content) {
    const id = item.props.id;
    if (id.length === 0 || id !== id.trim() || ids.has(id)) return false;
    ids.add(id);
    if (
      (item.type === "Table" || item.type === "Chart") &&
      item.props.sourceId !== undefined &&
      !sourceIds.has(item.props.sourceId)
    )
      return false;
    if (
      (item.type === "Grid" || item.type === "GridItem") &&
      !validLayoutContent(item.props.content, ids, sourceIds)
    )
      return false;
  }
  return true;
}

export function readDashboardSnapshot(userId: UserId): DashboardSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(dashboardStorageKey(userId));
    if (raw === null) return undefined;
    return validatedSnapshot(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

// Private-mode and quota failures must not prevent the current session working.
export function writeDashboardSnapshot(userId: UserId, snapshot: DashboardSnapshot): void {
  try {
    const validated = validatedSnapshot(snapshot);
    if (validated === undefined) return;
    window.localStorage.setItem(dashboardStorageKey(userId), JSON.stringify(validated));
  } catch {
    // Persistence is best-effort at the existing browser-local boundary.
  }
}

export function loadOrInstallStarterSnapshot(userId: UserId): DashboardSnapshot {
  const existing = readDashboardSnapshot(userId);
  if (existing !== undefined) return existing;
  const starter = starterSnapshot();
  writeDashboardSnapshot(userId, starter);
  return starter;
}

export type DashboardRouteSearch = {
  dashboard?: DashboardId;
  layout?: boolean;
  component?: LayoutItemId;
};

export function validateDashboardSearch(input: Record<string, unknown>): DashboardRouteSearch {
  const result: DashboardRouteSearch = {};
  const dashboard = DashboardIdSchema.safeParse(input.dashboard);
  if (dashboard.success) result.dashboard = dashboard.data;
  const component = LayoutItemIdSchema.safeParse(input.component);
  if (component.success) result.component = component.data;
  if (input.layout === true || input.layout === "true") result.layout = true;
  return result;
}
