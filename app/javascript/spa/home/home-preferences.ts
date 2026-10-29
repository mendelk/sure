import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod/mini";
import { apiFetch } from "../api/client";
import type { HomeSearch } from "./home-search";

const HomeSectionLayoutSchema = z.object({
  col_span: z.optional(z.string()),
  grow: z.optional(z.boolean()),
  min_height: z.optional(z.number()),
  width_toggle: z.optional(z.boolean()),
  height_preset: z.optional(z.string()),
  height_px: z.optional(z.number()),
});

const HomeSectionSchema = z.object({
  key: z.string(),
  visible: z.optional(z.boolean()),
  collapsed: z.optional(z.boolean()),
  collapsible: z.optional(z.boolean()),
  layout: z.optional(HomeSectionLayoutSchema),
});

const HomeResponseSchema = z.object({
  has_accounts: z.optional(z.boolean()),
  first_name: z.optional(z.string()),
  two_column: z.optional(z.boolean()),
  preview: z.optional(z.boolean()),
  period: z.optional(
    z.object({
      start_date: z.optional(z.string()),
      end_date: z.optional(z.string()),
      label: z.optional(z.string()),
    }),
  ),
  sections: z.optional(z.array(HomeSectionSchema)),
});

export type HomeSectionLayout = {
  colSpan: "single" | "full";
  grow: boolean;
  minHeight: number;
  widthToggle: boolean;
  heightPreset: "compact" | "auto" | "tall";
  heightPx: number;
};

export type HomeSectionInfo = {
  key: string;
  visible: boolean;
  collapsible: boolean;
  collapsed: boolean;
  layout: HomeSectionLayout;
};

export type HomePayload = {
  hasAccounts: boolean | undefined;
  firstName: string | undefined;
  twoColumn: boolean;
  preview: boolean;
  sections: HomeSectionInfo[];
};

export const HOME_HEIGHT_PRESETS = { compact: 208, auto: 288, tall: 416 } as const;
export type HomeHeightPreset = keyof typeof HOME_HEIGHT_PRESETS;

export const HOME_DEFAULT_ORDER = [
  "insights_feed",
  "cashflow_sankey",
  "cash_forecast",
  "money_flow",
  "spending_trend",
  "outflows_donut",
  "investment_summary",
  "net_worth_chart",
  "balance_sheet",
] as const;

function normalizeLayout(raw: unknown): HomeSectionLayout {
  const parsed =
    typeof raw === "object" && raw !== null
      ? z.parse(HomeSectionLayoutSchema, raw)
      : { col_span: undefined };
  const colSpan = parsed.col_span === "full" ? "full" : "single";
  const heightPreset: HomeHeightPreset =
    parsed.height_preset === "compact" || parsed.height_preset === "tall"
      ? parsed.height_preset
      : "auto";
  return {
    colSpan,
    grow: parsed.grow === true,
    minHeight: typeof parsed.min_height === "number" ? parsed.min_height : 0,
    widthToggle: parsed.width_toggle === true,
    heightPreset,
    heightPx:
      typeof parsed.height_px === "number" ? parsed.height_px : HOME_HEIGHT_PRESETS[heightPreset],
  };
}

function normalizePayload(payload: unknown): HomePayload {
  const parsed = z.parse(HomeResponseSchema, payload);
  const sections = (parsed.sections ?? []).map((section) => ({
    key: section.key,
    visible: section.visible !== false,
    collapsible: section.collapsible !== false,
    collapsed: section.collapsed === true,
    layout: normalizeLayout(section.layout),
  }));
  return {
    hasAccounts: parsed.has_accounts,
    firstName: parsed.first_name,
    twoColumn: parsed.two_column === true,
    preview: parsed.preview === true,
    sections,
  };
}

function homeQueryString(search: HomeSearch): string {
  const params = new URLSearchParams();
  if (search.period !== undefined) params.set("period", search.period);
  if (search.start_date !== undefined) params.set("start_date", search.start_date);
  if (search.end_date !== undefined) params.set("end_date", search.end_date);
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function homePageQueryOptions(homePath: string, search: HomeSearch) {
  return {
    queryKey: ["spa", "home", homePath, search.period, search.start_date, search.end_date] as const,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<HomePayload> => {
      const response = await apiFetch(`${homePath}${homeQueryString(search)}`, {
        signal,
      });
      if (!response.ok) throw new Error(`Home request failed (${response.status})`);
      return normalizePayload(await response.json().catch(() => null));
    },
    staleTime: 30_000,
    retry: false,
  };
}

export function useHomePayload(homePath: string | undefined, search: HomeSearch) {
  return useQuery({
    ...homePageQueryOptions(homePath ?? "/api/v1/home", search),
    enabled: homePath !== undefined && homePath.length > 0,
  });
}

async function persistHomePreferences(payload: Record<string, unknown>): Promise<void> {
  const response = await apiFetch("/api/v1/home/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences: payload }),
  });
  if (!response.ok) throw new Error(`Preferences save failed (${response.status})`);
}

function persistQuiet(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-empty-function -- Fire-and-forget preference sync; failures are intentionally silent.
  persistHomePreferences(payload).catch(() => {});
}

export type HomeLayoutState = {
  order: string[];
  collapsed: Record<string, boolean>;
  widths: Record<string, "single" | "full">;
  heights: Record<string, HomeHeightPreset>;
};

export function initialLayoutState(sections: HomeSectionInfo[]): HomeLayoutState {
  const saved =
    sections.length > 0 ? sections.map((section) => section.key) : [...HOME_DEFAULT_ORDER];
  const ordered = [...saved];
  for (const key of HOME_DEFAULT_ORDER) {
    if (key === "insights_feed") {
      if (!ordered.includes(key)) ordered.unshift(key);
    } else if (!ordered.includes(key)) ordered.push(key);
  }
  return {
    order: ordered,
    collapsed: Object.fromEntries(sections.map((section) => [section.key, section.collapsed])),
    widths: {},
    heights: {},
  };
}

export function useHomeLayout(sections: HomeSectionInfo[]) {
  const [state, setState] = useState<HomeLayoutState>(() => initialLayoutState(sections));
  const [hydrated, setHydrated] = useState(sections.length === 0);
  if (!hydrated && sections.length > 0) {
    setHydrated(true);
    setState(initialLayoutState(sections));
  }

  const move = useCallback((key: string, direction: -1 | 1) => {
    setState((current) => {
      const index = current.order.indexOf(key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.order.length) return current;
      const order = [...current.order];
      const [moved] = order.splice(index, 1);
      order.splice(target, 0, moved);
      persistQuiet({ section_order: order });
      return { ...current, order };
    });
  }, []);

  const reorder = useCallback((orderedKeys: string[]) => {
    setState((current) => {
      const known = new Set(current.order);
      const next = orderedKeys.filter((key) => known.has(key));
      for (const key of current.order) if (!next.includes(key)) next.push(key);
      persistQuiet({ section_order: next });
      return { ...current, order: next };
    });
  }, []);

  const toggle = useCallback((key: string) => {
    setState((current) => {
      const collapsed = { ...current.collapsed, [key]: !current.collapsed[key] };
      persistQuiet({ collapsed_sections: { [key]: collapsed[key] } });
      return { ...current, collapsed };
    });
  }, []);

  const setWidth = useCallback((key: string, colSpan: "single" | "full") => {
    setState((current) => {
      persistQuiet({ dashboard_section_layout: { [key]: { col_span: colSpan } } });
      return { ...current, widths: { ...current.widths, [key]: colSpan } };
    });
  }, []);

  const setHeight = useCallback((key: string, preset: HomeHeightPreset) => {
    setState((current) => {
      persistQuiet({ dashboard_section_layout: { [key]: { height: preset } } });
      return { ...current, heights: { ...current.heights, [key]: preset } };
    });
  }, []);

  return { layout: state, move, reorder, toggle, setWidth, setHeight };
}
