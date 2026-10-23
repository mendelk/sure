import type { ChartTheme } from "@tanstack/charts";

export const chartColors = {
  income: "var(--color-success)",
  expense: "var(--utility-text-subdued)",
  balance: "var(--color-info)",
  comparison: "var(--utility-text-subdued)",
  warning: "var(--color-warning)",
  negative: "var(--color-destructive)",
  text: "var(--utility-text-primary)",
  muted: "var(--utility-text-secondary)",
  grid: "var(--utility-border-primary)",
  container: "var(--color-container)",
} as const;

// Functional variables resolve on the chart surface, including after a theme change.
export const chartTheme = {
  foreground: chartColors.text,
  muted: chartColors.muted,
  grid: chartColors.grid,
  background: "transparent",
  focusRing: { fill: chartColors.container, strokeWidth: 2 },
} satisfies Partial<ChartTheme>;
