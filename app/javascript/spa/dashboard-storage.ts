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

export const DASHBOARD_GRID = { cols: 16, rowHeight: 32, gap: 16 } as const;

export type DashboardLayoutProps = {
  Table: { id: LayoutItemId; sourceId?: SourceId; visibleColumns: string[] };
  Chart: {
    id: LayoutItemId;
    sourceId?: SourceId;
    chartType: "line" | "bar" | "pie";
    categoryField: string;
    valueField: string;
  };
  RichText: { id: LayoutItemId; sourceId?: SourceId; content: string };
};

export type DashboardPosition = { x: number; y: number; w: number; h: number };
export type DashboardLayoutContent = {
  [Type in keyof DashboardLayoutProps]: {
    type: Type;
    props: DashboardLayoutProps[Type];
    position: DashboardPosition;
    heightMode: "fixed" | "auto";
  };
}[keyof DashboardLayoutProps][];

export type DashboardLayoutData = { content: DashboardLayoutContent };

export interface Dashboard {
  id: DashboardId;
  name: string;
  layout: DashboardLayoutData;
}

export interface DashboardSnapshot {
  formatVersion: 7;
  sources: Source[];
  dashboards: Dashboard[];
}

export function emptyDashboardLayout(): DashboardLayoutData {
  return { content: [] };
}

export function appendDashboardItem(
  layout: DashboardLayoutData,
  type: keyof DashboardLayoutProps,
  sourceId?: SourceId,
): DashboardLayoutData {
  const parts = crypto.getRandomValues(new Uint32Array(4));
  const id = LayoutItemIdSchema.parse(
    `component-${Array.from(parts, (part) => part.toString(16).padStart(8, "0")).join("")}`,
  );
  const reference = { id, ...(sourceId === undefined ? {} : { sourceId }) };
  const geometry = {
    position: {
      x: 0,
      y: layout.content.reduce(
        (bottom, item) => Math.max(bottom, item.position.y + item.position.h),
        0,
      ),
      w: type === "Chart" ? 4 : DASHBOARD_GRID.cols,
      h: type === "Chart" ? 5 : type === "Table" ? 4 : 6,
    },
    heightMode: "fixed" as const,
  };
  const item: DashboardLayoutContent[number] =
    type === "Table"
      ? { type, props: { ...reference, visibleColumns: [] }, ...geometry }
      : type === "Chart"
        ? {
            type,
            props: {
              ...reference,
              chartType: "line",
              categoryField: "",
              valueField: "",
            },
            ...geometry,
          }
        : { type, props: { ...reference, content: "" }, ...geometry };
  return { content: [...layout.content, item] };
}

// Presentation is independent of the shared source catalog.
const positionShape = {
  position: z
    .strictObject({
      x: z.int().check(z.minimum(0), z.maximum(DASHBOARD_GRID.cols - 1)),
      y: z.int().check(z.minimum(0)),
      w: z.int().check(z.minimum(1), z.maximum(DASHBOARD_GRID.cols)),
      h: z.int().check(z.minimum(1)),
    })
    .check(z.refine((position) => position.x + position.w <= DASHBOARD_GRID.cols)),
  heightMode: z.enum(["fixed", "auto"]),
};
const DashboardContentSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("Table"),
    ...positionShape,
    props: z.strictObject({
      id: LayoutItemIdSchema,
      sourceId: z.optional(SourceIdSchema),
      visibleColumns: z.array(z.string()),
    }),
  }),
  z.strictObject({
    type: z.literal("Chart"),
    ...positionShape,
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
    ...positionShape,
    props: z.strictObject({
      id: LayoutItemIdSchema,
      sourceId: z.optional(SourceIdSchema),
      content: z.string(),
    }),
  }),
]);

export const DashboardLayoutSchema = z.strictObject({
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
    z.strictObject({
      kind: z.literal("structured"),
      definition: StrictReportDefinitionSchema,
    }),
    z.strictObject({ kind: z.literal("sureql"), query: NonEmptyStringSchema }),
  ]),
});
const DashboardSchema = z.strictObject({
  id: DashboardIdSchema,
  name: NonEmptyStringSchema,
  layout: DashboardLayoutSchema,
});
const DashboardSnapshotSchema = z.strictObject({
  formatVersion: z.literal(7),
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
    formatVersion: 7,
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
              {
                id: ReportDimensionIdSchema.parse("category"),
                field: "category",
              },
              {
                id: ReportDimensionIdSchema.parse("row_currency"),
                field: "currency",
              },
            ],
            columns: [
              {
                id: ReportDimensionIdSchema.parse("column_currency"),
                field: "currency",
              },
            ],
            values: [
              {
                id: ReportMeasureIdSchema.parse("spending"),
                field: "amount",
                aggregation: "sum",
              },
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
          content: [
            {
              type: "Table",
              props: {
                id: LayoutItemIdSchema.parse("transactions-table"),
                sourceId: transactionsId,
                visibleColumns: [],
              },
              position: { x: 0, y: 0, w: DASHBOARD_GRID.cols, h: 4 },
              heightMode: "fixed",
            },
            {
              type: "Chart",
              props: {
                id: LayoutItemIdSchema.parse("spending-chart"),
                sourceId: spendingId,
                chartType: "pie",
                categoryField: "",
                valueField: "",
              },
              position: { x: 0, y: 4, w: 4, h: 5 },
              heightMode: "fixed",
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
      item.type !== "RichText" &&
      item.props.sourceId !== undefined &&
      !sourceIds.has(item.props.sourceId)
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
  component?: LayoutItemId;
};

export function validateDashboardSearch(input: Record<string, unknown>): DashboardRouteSearch {
  const result: DashboardRouteSearch = {};
  const dashboard = DashboardIdSchema.safeParse(input.dashboard);
  if (dashboard.success) result.dashboard = dashboard.data;
  const component = LayoutItemIdSchema.safeParse(input.component);
  if (component.success) result.component = component.data;
  return result;
}
