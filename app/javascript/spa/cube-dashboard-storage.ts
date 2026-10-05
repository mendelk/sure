import * as z from "zod/mini";
import type { Layout } from "react-grid-layout";
import { CUBE_GRANULARITIES, CUBE_MEASURES, type CubeMeasure, type CubeQuery } from "./api/cube";
import { generateDashboardId } from "./dashboard-storage";

export const CubeReportSettingsSchema = z.object({
  measures: z.array(z.enum(CUBE_MEASURES)),
  grouping: z.enum(["date", "category", "account"]),
  start: z.string(),
  end: z.string(),
  granularity: z.enum(CUBE_GRANULARITIES),
  presentation: z.enum(["table", "line", "pie"]),
});
const StoredReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  settings: CubeReportSettingsSchema,
});
const StoredDashboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  reports: z.array(z.unknown()),
  layout: z.unknown(),
});
const StoredSnapshotSchema = z.object({ version: z.literal(1), dashboards: z.array(z.unknown()) });
const StoredLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type CubeReportSettings = z.infer<typeof CubeReportSettingsSchema>;
export interface CubeReport {
  id: string;
  name: string;
  settings: CubeReportSettings;
}
export interface CubeDashboard {
  id: string;
  name: string;
  reports: CubeReport[];
  layout: Layout;
}
export interface CubeDashboardSnapshot {
  version: 1;
  dashboards: CubeDashboard[];
}

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function defaultCubeSettings(): CubeReportSettings {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  return {
    measures: ["cash_flow.income"],
    grouping: "date",
    start: dateString(start),
    end: dateString(end),
    granularity: "month",
    presentation: "table",
  };
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function validCubeSettings(settings: CubeReportSettings): boolean {
  return (
    settings.measures.length > 0 &&
    new Set(settings.measures).size === settings.measures.length &&
    validDate(settings.start) &&
    validDate(settings.end) &&
    settings.start <= settings.end &&
    (settings.presentation === "table" || settings.measures.length === 1)
  );
}

export function cubeQuery(settings: CubeReportSettings): CubeQuery {
  return {
    measures: settings.measures,
    dimensions: settings.grouping === "date" ? [] : [`cash_flow.${settings.grouping}`],
    timeDimensions: [
      {
        dimension: "cash_flow.date",
        dateRange: [settings.start, settings.end],
        ...(settings.grouping === "date" ? { granularity: settings.granularity } : {}),
      },
    ],
    order: {
      [settings.grouping === "date" ? "cash_flow.date" : `cash_flow.${settings.grouping}`]: "asc",
    },
    limit: 500,
  };
}

export function cubeGroupKey(settings: CubeReportSettings): string {
  return settings.grouping === "date"
    ? `cash_flow.date.${settings.granularity}`
    : `cash_flow.${settings.grouping}`;
}

export function cubeMeasureLabel(measure: CubeMeasure, text: Record<string, string>): string {
  return text[measure.slice("cash_flow.".length)];
}

export function cubeStorageKey(userId: string): string {
  return `sure:cube-dashboards:${userId}`;
}

export function normalizeCubeLayout(value: unknown, reports: CubeReport[]): Layout {
  const layout: Layout[number][] = [];
  const used = new Set<string>();
  const items = z.array(z.unknown()).safeParse(value);
  if (items.success) {
    for (const candidate of items.data) {
      const parsed = StoredLayoutItemSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const item = parsed.data;
      if (used.has(item.i) || !reports.some((report) => report.id === item.i)) continue;
      const w = Math.max(3, Math.min(12, Math.round(item.w)));
      layout.push({
        i: item.i,
        x: Math.max(0, Math.min(12 - w, Math.round(item.x))),
        y: Math.max(0, Math.min(reports.length * 30, Math.round(item.y))),
        w,
        h: Math.max(3, Math.min(30, Math.round(item.h))),
        minW: 3,
        minH: 3,
        maxH: 30,
      });
      used.add(item.i);
    }
  }
  let nextY = layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
  for (const report of reports) {
    if (used.has(report.id)) continue;
    layout.push({ i: report.id, x: 0, y: nextY, w: 6, h: 5, minW: 3, minH: 3 });
    nextY += 5;
  }
  return layout;
}

function normalizeSnapshot(value: unknown): CubeDashboardSnapshot | undefined {
  const parsedSnapshot = StoredSnapshotSchema.safeParse(value);
  if (!parsedSnapshot.success) return undefined;
  const dashboards: CubeDashboard[] = [];
  const dashboardIds = new Set<string>();
  for (const candidate of parsedSnapshot.data.dashboards) {
    const parsedDashboard = StoredDashboardSchema.safeParse(candidate);
    if (!parsedDashboard.success) continue;
    const dashboard = parsedDashboard.data;
    if (!dashboard.id.trim() || dashboardIds.has(dashboard.id) || !dashboard.name.trim()) continue;
    const reports: CubeReport[] = [];
    const reportIds = new Set<string>();
    for (const candidateReport of dashboard.reports) {
      const parsedReport = StoredReportSchema.safeParse(candidateReport);
      if (!parsedReport.success) continue;
      const report = parsedReport.data;
      if (
        !report.id.trim() ||
        reportIds.has(report.id) ||
        !report.name.trim() ||
        !validCubeSettings(report.settings)
      )
        continue;
      reports.push({ id: report.id, name: report.name.trim(), settings: report.settings });
      reportIds.add(report.id);
    }
    dashboards.push({
      id: dashboard.id,
      name: dashboard.name.trim(),
      reports,
      layout: normalizeCubeLayout(dashboard.layout, reports),
    });
    dashboardIds.add(dashboard.id);
  }
  return { version: 1, dashboards };
}

export function starterCubeSnapshot(text: Record<string, string>): CubeDashboardSnapshot {
  const settings = defaultCubeSettings();
  const reports: CubeReport[] = [
    {
      id: generateDashboardId(),
      name: text.starter_income,
      settings: { ...settings, presentation: "line" },
    },
    {
      id: generateDashboardId(),
      name: text.starter_expenses,
      settings: { ...settings, measures: ["cash_flow.expenses"], presentation: "line" },
    },
    {
      id: generateDashboardId(),
      name: text.starter_categories,
      settings: {
        ...settings,
        measures: ["cash_flow.expenses"],
        grouping: "category",
        presentation: "pie",
      },
    },
  ];
  const layout: Layout = reports.map((report, index) => ({
    i: report.id,
    x: (index % 2) * 6,
    y: Math.floor(index / 2) * 5,
    w: 6,
    h: 5,
    minW: 3,
    minH: 3,
  }));
  return {
    version: 1,
    dashboards: [{ id: generateDashboardId(), name: text.starter_dashboard, reports, layout }],
  };
}

export function writeCubeSnapshot(userId: string, snapshot: CubeDashboardSnapshot): boolean {
  try {
    localStorage.setItem(cubeStorageKey(userId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadCubeSnapshot(
  userId: string,
  text: Record<string, string>,
): { snapshot: CubeDashboardSnapshot; stored: boolean } {
  try {
    const raw = localStorage.getItem(cubeStorageKey(userId));
    const normalized = raw === null ? undefined : normalizeSnapshot(JSON.parse(raw));
    if (normalized !== undefined) return { snapshot: normalized, stored: true };
  } catch {
    // A corrupt or inaccessible browser store must not prevent querying Cube.
  }
  const snapshot = starterCubeSnapshot(text);
  return { snapshot, stored: writeCubeSnapshot(userId, snapshot) };
}

export function validateCubeDashboardSearch(input: Record<string, unknown>): {
  dashboard?: string;
} {
  return typeof input.dashboard === "string" && input.dashboard.length > 0
    ? { dashboard: input.dashboard }
    : {};
}
