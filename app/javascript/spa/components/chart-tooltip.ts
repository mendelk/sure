import type { ChartTooltipOptions, ChartValue } from "@tanstack/charts";
import type {
  ChartTooltipExtension,
  ChartTooltipExtensionContext,
  ChartTooltipExtensionInstance,
} from "@tanstack/charts/tooltip";

// Own the tooltip through the chart's extension seam: mouse movement must not
// repeatedly announce financial values, while keyboard navigation must.
export const chartTooltip: ChartTooltipExtension = {
  id: "sure-chart-tooltip",
  __chartExtensionType: "tooltip",
  __chartTooltipHost: "dom",
  create<TDatum, TXValue extends ChartValue, TYValue extends ChartValue>({
    container,
  }: ChartTooltipExtensionContext<TDatum, TXValue, TYValue>): ChartTooltipExtensionInstance<
    TDatum,
    TXValue,
    TYValue
  > {
    const element = container.ownerDocument.createElement("div");
    element.className =
      "ts-chart-tooltip pointer-events-none absolute z-20 whitespace-pre-line rounded-lg border border-primary bg-container p-3 text-xs text-primary shadow-md";
    element.style.maxWidth = "calc(100% - 1rem)";
    element.hidden = true;
    container.append(element);
    let formatGroup: ChartTooltipOptions<TDatum, TXValue, TYValue>["formatGroup"];
    return {
      update(options) {
        formatGroup = options.formatGroup;
      },
      paint({ points, point, scene, focus, pinned }) {
        if (formatGroup === undefined) throw new Error("Chart tooltip requires a group formatter");
        const content = formatGroup(points, {
          primaryPoint: point,
          pinned,
          xLabel: "",
          yLabel: "",
          formatX: String,
          formatY: String,
        });
        const keyboard = focus.source === "keyboard";
        element.setAttribute("role", keyboard ? "status" : "tooltip");
        element.setAttribute("aria-live", keyboard ? "polite" : "off");
        if (element.textContent !== content) element.textContent = content;
        element.hidden = content === "";
        if (element.hidden) return;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const top = point.y >= height + 12 ? point.y - height - 12 : point.y + 12;
        element.style.left = `${Math.max(8, Math.min(point.x - width / 2, scene.width - width - 8))}px`;
        element.style.top = `${Math.max(8, Math.min(top, scene.height - height - 8))}px`;
      },
      hide() {
        element.hidden = true;
      },
      contains(target) {
        return target instanceof Node && element.contains(target);
      },
      destroy() {
        element.remove();
      },
    };
  },
};
