import type { ChartValue } from "@tanstack/charts";
import {
  tooltip,
  type ChartTooltipExtension,
  type ChartTooltipExtensionContext,
  type ChartTooltipExtensionInstance,
} from "@tanstack/charts/tooltip";

// Keep TanStack's content, layout, pinning, and cleanup. The application owns
// semantic colors and the accessibility distinction between pointer and keyboard.
export const chartTooltip: ChartTooltipExtension = {
  id: "sure-chart-tooltip",
  __chartExtensionType: "tooltip",
  __chartTooltipHost: "dom",
  create<TDatum, TXValue extends ChartValue, TYValue extends ChartValue>(
    context: ChartTooltipExtensionContext<TDatum, TXValue, TYValue>,
  ): ChartTooltipExtensionInstance<TDatum, TXValue, TYValue> {
    const style = context.container.style;
    style.setProperty("--ts-chart-tooltip-background", "var(--color-container)");
    style.setProperty("--ts-chart-tooltip-color", "var(--utility-text-primary)");
    style.setProperty("--ts-chart-tooltip-border", "1px solid var(--utility-border-primary)");
    style.setProperty("--ts-chart-tooltip-padding", "0.75rem");
    style.setProperty("--ts-chart-tooltip-max-width", "min(24rem, calc(100% - 1rem))");
    const native = tooltip.create(context);
    let element: HTMLElement | null = null;
    return {
      ...native,
      update(options) {
        native.update({
          ...options,
          className: `sure-chart-tooltip privacy-sensitive ph-no-capture rounded-lg border border-primary bg-container p-3 text-xs text-primary shadow-md ${options.className ?? ""}`,
        });
      },
      paint(paintContext) {
        native.paint(paintContext);
        element ??= context.container.querySelector<HTMLElement>(".sure-chart-tooltip");
        if (element === null) return;
        if (element.getAttribute("role") === "dialog") return;
        const keyboard = paintContext.focus.source === "keyboard";
        element.setAttribute("role", keyboard ? "status" : "tooltip");
        element.setAttribute("aria-live", keyboard ? "polite" : "off");
      },
    };
  },
};
