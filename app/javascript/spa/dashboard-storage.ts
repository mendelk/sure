import type { Layout, LayoutItem } from "react-grid-layout";
import * as z from "zod/mini";

// Feature-local snapshot for the first /dashboards prototype only. It stores
// the exact working screen — the saved report source plus the report card's
// grid position/size — so iteration survives refresh. Titles are not stored:
// the page has no editable dashboard or report titles yet, and later slices
// own naming. Keep this shape minimal; do not extend it speculatively.
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

const DashboardSnapshotSchema = z.object({
  query: z.string(),
  layout: z.array(DashboardLayoutItemSchema),
});

export interface DashboardSnapshot {
  query: string;
  layout: Layout;
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
    const query = result.data.query;
    if (query.trim().length === 0 || result.data.layout.length === 0) return undefined;
    const layout: Layout = result.data.layout.map((item): LayoutItem => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    }));
    return { query, layout };
  } catch {
    return undefined;
  }
}

// Best-effort write: private-mode/quota failures must never break the page.
export function writeDashboardSnapshot(userId: string, snapshot: DashboardSnapshot): void {
  try {
    window.localStorage.setItem(dashboardStorageKey(userId), JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — the session still works, persistence is skipped.
  }
}
