import type { Layout, LayoutItem } from "react-grid-layout";
import * as z from "zod/mini";

// One source-controlled starter screen for first use and repeated design
// review: a useful transactions table sized for the editor plus results.
// Independent of fixture IDs, current dates, random values, and
// developer-local data — plain literals only. Editable after install like
// any saved snapshot.
export const STARTER_QUERY = "from transactions\nsort {-date}\ntake 10";

export const STARTER_DASHBOARD_ID = "starter-dashboard";
export const STARTER_DASHBOARD_NAME = "My dashboard";
export const STARTER_REPORT_ID = "sureql-report";
export const STARTER_REPORT_NAME = "Recent transactions";

export const STARTER_LAYOUT: Layout = [
  {
    i: STARTER_REPORT_ID,
    x: 0,
    y: 0,
    w: 12,
    h: 4,
    minW: 4,
    minH: 3,
  },
];

// Feature-local snapshot for the /dashboards prototype only. It stores a
// plain dashboard array; each dashboard keeps its own report cards and grid
// positions. Keep this shape local until the report-entity slice defines a
// durable domain model.
const DashboardLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.optional(z.number()),
  minH: z.optional(z.number()),
  maxW: z.optional(z.number()),
  maxH: z.optional(z.number()),
});

const DashboardReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  query: z.string(),
  presentation: z.optional(z.enum(["table", "chart"])),
});

const DashboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  reports: z.array(DashboardReportSchema),
  layout: z.array(DashboardLayoutItemSchema),
});

const DashboardSnapshotSchema = z.object({
  dashboards: z.optional(z.array(DashboardSchema)),
  // Legacy single-dashboard fields, migrated to a one-item array on read.
  dashboardName: z.optional(z.string()),
  reports: z.optional(z.array(DashboardReportSchema)),
  reportName: z.optional(z.string()),
  query: z.optional(z.string()),
  layout: z.optional(z.array(DashboardLayoutItemSchema)),
});
export interface DashboardReport {
  id: string;
  name: string;
  query: string;
  presentation: "table" | "chart";
}

export interface Dashboard {
  id: string;
  name: string;
  reports: DashboardReport[];
  layout: Layout;
}

export interface DashboardSnapshot {
  dashboards: Dashboard[];
}

export function generateDashboardId(): string {
  const parts = crypto.getRandomValues(new Uint32Array(4));
  return `dashboard-${Array.from(parts, (part) => part.toString(16).padStart(8, "0")).join("")}`;
}

export function starterDashboard(): Dashboard {
  return {
    id: STARTER_DASHBOARD_ID,
    name: STARTER_DASHBOARD_NAME,
    reports: [
      {
        id: STARTER_REPORT_ID,
        name: STARTER_REPORT_NAME,
        query: STARTER_QUERY,
        presentation: "table",
      },
    ],
    layout: structuredClone(STARTER_LAYOUT),
  };
}

export function starterSnapshot(): DashboardSnapshot {
  return { dashboards: [starterDashboard()] };
}

export function dashboardStorageKey(userId: string): string {
  return `sure:dashboards:${userId}`;
}

// Deterministic survivor: the requested dashboard when it still exists,
// otherwise the first remaining dashboard. Undefined when none remain.
export function selectActiveDashboard(
  snapshot: DashboardSnapshot,
  requestedId: string | undefined,
): Dashboard | undefined {
  if (snapshot.dashboards.length === 0) return undefined;
  if (requestedId !== undefined) {
    const match = snapshot.dashboards.find((dashboard) => dashboard.id === requestedId);
    if (match !== undefined) return match;
  }
  return snapshot.dashboards[0];
}

// Defensive read: malformed JSON, schema drift, or unavailable storage all
// fall back to undefined so the page boots its starter screen and still runs.
export function readDashboardSnapshot(userId: string): DashboardSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(dashboardStorageKey(userId));
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const result = DashboardSnapshotSchema.safeParse(parsed);
    if (!result.success) return undefined;
    if (result.data.dashboards !== undefined) return normalizeDashboards(result.data.dashboards);

    return migrateLegacySnapshot(result.data);
  } catch {
    return undefined;
  }
}

function normalizeDashboards(
  storedDashboards: z.infer<typeof DashboardSchema>[],
): DashboardSnapshot | undefined {
  const ids = new Set<string>();
  const dashboards: Dashboard[] = [];
  for (const storedDashboard of storedDashboards) {
    const normalized = normalizeDashboard(storedDashboard);
    if (normalized === undefined || ids.has(normalized.id)) return undefined;
    ids.add(normalized.id);
    dashboards.push(normalized);
  }
  return { dashboards };
}

function normalizeDashboard(
  storedDashboard: z.infer<typeof DashboardSchema>,
): Dashboard | undefined {
  const id = storedDashboard.id.trim();
  const storedName = storedDashboard.name.trim();
  if (id.length === 0) return undefined;
  const reports = normalizeReports(storedDashboard.reports);
  if (reports === undefined) return undefined;
  const layout = normalizeLayout(
    storedDashboard.layout,
    new Set(reports.map((report) => report.id)),
  );
  if (layout === undefined) return undefined;
  return {
    id,
    name: storedName.length === 0 ? STARTER_DASHBOARD_NAME : storedName,
    reports,
    layout,
  };
}

function migrateLegacySnapshot(
  stored: Omit<z.infer<typeof DashboardSnapshotSchema>, "dashboards">,
): DashboardSnapshot | undefined {
  const storedName = stored.dashboardName?.trim();
  const reports =
    stored.reports === undefined
      ? migrateLegacyReport(stored.reportName, stored.query)
      : normalizeReports(stored.reports);
  if (reports === undefined) return undefined;
  if (stored.layout === undefined) return undefined;
  const layout = normalizeLayout(stored.layout, new Set(reports.map((report) => report.id)));
  if (layout === undefined) return undefined;
  return {
    dashboards: [
      {
        id: STARTER_DASHBOARD_ID,
        name:
          storedName === undefined || storedName.length === 0 ? STARTER_DASHBOARD_NAME : storedName,
        reports,
        layout,
      },
    ],
  };
}

function migrateLegacyReport(
  storedName: string | undefined,
  storedQuery: string | undefined,
): DashboardReport[] | undefined {
  const query = storedQuery?.trim();
  if (query === undefined || query.length === 0) return undefined;
  const name = storedName?.trim();
  return [
    {
      id: STARTER_REPORT_ID,
      name: name === undefined || name.length === 0 ? STARTER_REPORT_NAME : name,
      query,
      presentation: "table",
    },
  ];
}

function normalizeReports(
  storedReports: z.infer<typeof DashboardReportSchema>[],
): DashboardReport[] | undefined {
  const ids = new Set<string>();
  const reports: DashboardReport[] = [];
  for (const storedReport of storedReports) {
    const id = storedReport.id.trim();
    const name = storedReport.name.trim();
    const query = storedReport.query.trim();
    if (id.length === 0 || name.length === 0 || query.length === 0 || ids.has(id)) return undefined;
    ids.add(id);
    reports.push({
      id,
      name,
      query,
      presentation: storedReport.presentation === "chart" ? "chart" : "table",
    });
  }
  return reports;
}

function normalizeLayout(
  storedLayout: z.infer<typeof DashboardLayoutItemSchema>[],
  reportIds: Set<string>,
): Layout | undefined {
  const layoutIds = new Set<string>();
  const layout: LayoutItem[] = [];
  for (const item of storedLayout) {
    if (!reportIds.has(item.i) || layoutIds.has(item.i)) return undefined;
    layoutIds.add(item.i);
    layout.push({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    });
  }
  if (layoutIds.size !== reportIds.size) return undefined;
  return layout;
}

// Best-effort write: private-mode/quota failures must never break the page.
export function writeDashboardSnapshot(userId: string, snapshot: DashboardSnapshot): void {
  try {
    window.localStorage.setItem(dashboardStorageKey(userId), JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — the session still works, persistence is skipped.
  }
}

// Install the starter only when the current user's key is absent, so first
// use and design review are deterministic but customizations are never
// overwritten. Returns the snapshot the page should boot with.
export function loadOrInstallStarterSnapshot(userId: string): DashboardSnapshot {
  const existing = readDashboardSnapshot(userId);
  if (existing !== undefined) return existing;
  const starter = starterSnapshot();
  writeDashboardSnapshot(userId, starter);
  return starter;
}

export type DashboardRouteSearch = {
  dashboard?: string;
};

export function validateDashboardSearch(input: Record<string, unknown>): DashboardRouteSearch {
  const dashboard = input.dashboard;
  if (typeof dashboard === "string" && dashboard.trim().length > 0) return { dashboard };
  return {};
}
