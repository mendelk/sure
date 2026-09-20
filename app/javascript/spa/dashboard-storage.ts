import type { Layout, LayoutItem } from "react-grid-layout";
import * as z from "zod/mini";

// One source-controlled starter screen for first use and repeated design
// review: a useful transactions table sized for the editor plus results.
// Independent of fixture IDs, current dates, random values, and
// developer-local data — plain literals only. Editable after install like
// any saved snapshot.
export const STARTER_QUERY = "from transactions\nsort {-date}\ntake 10";

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

// Feature-local snapshot for the first /dashboards prototype only. It stores
// a plain report array plus the grid positions needed to recreate the working
// screen. Keep this shape local until the report-entity slice defines a durable
// domain model.
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
});

const DashboardSnapshotSchema = z.object({
  dashboardName: z.optional(z.string()),
  reports: z.optional(z.array(DashboardReportSchema)),
  reportName: z.optional(z.string()),
  query: z.optional(z.string()),
  layout: z.array(DashboardLayoutItemSchema),
});

export interface DashboardReport {
  id: string;
  name: string;
  query: string;
}

export interface DashboardSnapshot {
  dashboardName: string;
  reports: DashboardReport[];
  layout: Layout;
}

export function starterSnapshot(): DashboardSnapshot {
  return {
    dashboardName: STARTER_DASHBOARD_NAME,
    reports: [
      {
        id: STARTER_REPORT_ID,
        name: STARTER_REPORT_NAME,
        query: STARTER_QUERY,
      },
    ],
    layout: structuredClone(STARTER_LAYOUT),
  };
}

export function dashboardStorageKey(userId: string): string {
  return `sure:dashboards:${userId}`;
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

    const storedDashboardName = result.data.dashboardName?.trim();
    const dashboardName =
      storedDashboardName === undefined || storedDashboardName.length === 0
        ? STARTER_DASHBOARD_NAME
        : storedDashboardName;
    const reports =
      result.data.reports === undefined
        ? migrateLegacyReport(result.data.reportName, result.data.query)
        : normalizeReports(result.data.reports);
    if (reports === undefined) return undefined;

    const reportIds = new Set(reports.map((report) => report.id));
    const layoutIds = new Set<string>();
    const layout: LayoutItem[] = [];
    for (const item of result.data.layout) {
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

    return { dashboardName, reports, layout };
  } catch {
    return undefined;
  }
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
    reports.push({ id, name, query });
  }
  return reports;
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
