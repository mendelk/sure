import { createMark, d3Curve, defineChart, link, rect, text } from "@tanstack/charts";
import type { ChartMark, ChartMarkStateContext, DomChartDefinition } from "@tanstack/charts";
import { sankeyDiagram } from "@tanstack/charts/network/sankey";
import type { SankeyLink, SankeyNode } from "@tanstack/charts/network/sankey";
import { curveBumpX } from "d3-shape";
import { hiddenSankeyLabels } from "../utils/sankey_labels.mjs";
import { chartColors, chartTheme } from "./theme";
import { chartTooltip } from "./tooltip";

export type SankeyGraphNode = {
  id: string;
  name: string;
  filter_value: string | null;
  value: number;
  percentage: number;
  color: string | null;
};
export type SankeyGraphLink = {
  source: number | string;
  target: number | string;
  value: number;
  percentage: number;
  color: string | null;
};
export type SankeyGraph = { nodes: SankeyGraphNode[]; links: SankeyGraphLink[] };
type InputLink = Omit<SankeyGraphLink, "source" | "target"> & {
  source: string;
  target: string;
  gradientId: string;
};
export type DiagramNode = SankeyNode<SankeyGraphNode, InputLink, string>;
export type DiagramLink = SankeyLink<SankeyGraphNode, InputLink, string>;
type DiagramLabel = { kind: "label"; node: DiagramNode };
export type SankeyDatum = DiagramNode | DiagramLink | DiagramLabel;
export type SankeyOptions = {
  expanded?: boolean;
  formatValue: (value: number) => string;
};

const CASH_FLOW_NODE_ID = "cash_flow_node";
const EXTENT_MARGIN = 16;
const MIN_LABEL_SPACING = 32;
const flowCurve = d3Curve(curveBumpX);
const resolveColor = (color?: string | null) =>
  color === undefined || color === null || color === "" ? chartColors.expense : color;
const endpointId = (data: SankeyGraph, endpoint: number | string): string | undefined =>
  typeof endpoint === "number" ? data.nodes[endpoint]?.id : endpoint;

export function sankeyDescendants(data: SankeyGraph, rootId: string): Set<string> {
  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();
  for (const edge of data.links) {
    const source = endpointId(data, edge.source);
    const target = endpointId(data, edge.target);
    if (source === undefined || target === undefined) continue;
    const outgoing = outbound.get(source) ?? [];
    outgoing.push(target);
    outbound.set(source, outgoing);
    const incoming = inbound.get(target) ?? [];
    incoming.push(source);
    inbound.set(target, incoming);
  }
  const reachable = (from: string, to: string): boolean => {
    const visited = new Set([from]);
    const queue = [from];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === to) return true;
      for (const next of outbound.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    return false;
  };
  const cashFlowId = data.nodes.find((node) => node.id === CASH_FLOW_NODE_ID)?.id;
  const children = (id: string): string[] => {
    if (id === cashFlowId) return outbound.get(id) ?? [];
    if (cashFlowId !== undefined && reachable(cashFlowId, id)) return outbound.get(id) ?? [];
    if (cashFlowId !== undefined && reachable(id, cashFlowId)) return inbound.get(id) ?? [];
    return [];
  };
  const included = new Set([rootId]);
  const queue = [rootId];
  for (let head = 0; head < queue.length; head += 1) {
    for (const child of children(queue[head])) {
      if (included.has(child)) continue;
      included.add(child);
      queue.push(child);
    }
  }
  return included;
}

export function visibleSankeyGraph(data: SankeyGraph, zoomRootId: string | null): SankeyGraph {
  if (zoomRootId === null) return data;
  const included = sankeyDescendants(data, zoomRootId);
  const root = data.nodes.find((node) => node.id === zoomRootId);
  if (included.size <= 1 || root === undefined) return data;
  const kept = new Set([...included, CASH_FLOW_NODE_ID]);
  const nodes: SankeyGraphNode[] = [];
  for (const node of data.nodes) {
    if (!kept.has(node.id)) continue;
    nodes.push(
      node.id === CASH_FLOW_NODE_ID
        ? { ...node, value: root.value, percentage: root.percentage }
        : node,
    );
  }
  return {
    nodes,
    links: data.links.flatMap((edge) => {
      const source = endpointId(data, edge.source);
      const target = endpointId(data, edge.target);
      return source !== undefined && target !== undefined && kept.has(source) && kept.has(target)
        ? [{ ...edge, source, target }]
        : [];
    }),
  };
}

export function sankeyColumns(data: SankeyGraph) {
  const incoming = new Map(data.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(data.nodes.map((node) => [node.id, [] as string[]]));
  const depths = new Map(data.nodes.map((node) => [node.id, 0]));
  for (const edge of data.links) {
    const source = endpointId(data, edge.source);
    const target = endpointId(data, edge.target);
    if (source === undefined || target === undefined) continue;
    outgoing.get(source)?.push(target);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }
  const queue = data.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    for (const target of outgoing.get(id) ?? []) {
      depths.set(target, Math.max(depths.get(target) ?? 0, (depths.get(id) ?? 0) + 1));
      const remaining = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  const lastLayer = Math.max(0, ...depths.values());
  const counts = new Map<number, number>();
  for (const node of data.nodes) {
    const layer = outgoing.get(node.id)?.length === 0 ? lastLayer : (depths.get(node.id) ?? 0);
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return { count: lastLayer + 1, largest: Math.max(1, ...counts.values()) };
}

export function sankeyChartSize(data: SankeyGraph, height: number, expanded = false) {
  const columns = sankeyColumns(data);
  return {
    height: expanded ? Math.max(height, columns.largest * 44 + EXTENT_MARGIN * 4) : height,
    minWidth: Math.max(320, columns.count * 160),
  };
}

function shortLabel(name: string, width: number): string {
  const characters = Array.from(name);
  const limit = Math.max(8, Math.floor(width / 7));
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : name;
}

// Resolved network layouts cannot compose decorative's post-domain filter.
// Keep native text geometry; label hit rectangles own focus and activation.
function labelText(mark: ChartMark<DiagramLabel, number, number>) {
  return createMark((context) => {
    const initialized = mark.initialize(context);
    return {
      ...initialized,
      render: (renderContext) => ({ ...initialized.render(renderContext), points: [] }),
    };
  });
}

function focusedDatum(context: ChartMarkStateContext<SankeyDatum>): DiagramNode | DiagramLink {
  const datum = context.focus.primary.datum;
  return datum.kind === "label" ? datum.node : datum;
}

function nodeConnected(node: DiagramNode, focused: DiagramNode | DiagramLink): boolean {
  if (focused.kind === "link") {
    return (
      node.data.id === focused.sourceNode.data.id || node.data.id === focused.targetNode.data.id
    );
  }
  return node.data.id === focused.data.id;
}

export function sankeyDefinition(data: SankeyGraph, options: SankeyOptions): SankeyDefinition {
  const { expanded = false, formatValue } = options;
  const columns = sankeyColumns(data);
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const inputLinks: InputLink[] = data.links.map((edge, index) => ({
    ...edge,
    source: endpointId(data, edge.source)!,
    target: endpointId(data, edge.target)!,
    gradientId: `flow-${index}`,
  }));
  return defineChart({
    theme: chartTheme,
    marks: [
      sankeyDiagram({
        nodes: data.nodes,
        links: inputLinks,
        nodeKey: "id",
        source: "source",
        target: "target",
        value: "value",
        nodeWidth: 15,
        nodePadding: ({ height }) =>
          expanded
            ? MIN_LABEL_SPACING
            : Math.min(
                20,
                ((height - EXTENT_MARGIN * 4) * 0.35) / Math.max(columns.largest - 1, 1),
              ),
        inset: { left: 12, right: 12, top: 32, bottom: 16 },
        marks: ({ nodes, links, chart }) => {
          const hidden = hiddenSankeyLabels(nodes, {
            height: chart.height,
            minSpacing: chart.height > 600 ? MIN_LABEL_SPACING / 0.7 : MIN_LABEL_SPACING,
          });
          const labels: DiagramLabel[] = nodes
            .filter((node) => !hidden.has(node.index))
            .map((node) => ({ kind: "label", node }));
          const center = nodes.find((node) => node.data.id === CASH_FLOW_NODE_ID);
          const labelX = ({ node }: DiagramLabel) =>
            node.x0 <= (center?.x0 ?? 0) ? node.x1 + 8 : node.x0 - 8;
          const labelAnchor = ({ node }: DiagramLabel) =>
            node.x0 <= (center?.x0 ?? 0) ? ("start" as const) : ("end" as const);
          const labelWidth = Math.min(
            176,
            ((chart.width - 24) / Math.max(columns.count - 1, 1)) * 0.45,
          );
          const flows = link(links, {
            id: "sankey-flows",
            x1: "x1",
            y1: "y1",
            x2: "x2",
            y2: "y2",
            key: "key",
            curve: flowCurve,
            strokeWidth: (flow) => Math.max(1, flow.width),
            stroke: (flow) => `url(#${flow.data.gradientId})`,
            strokeOpacity: 0.25,
            lineCap: "butt",
          });
          // Link's public API has no states option. Compose the ordinary mark's
          // native state channel, without replacing its geometry or focus model.
          const focusedFlows = createMark((buildContext) => ({
            ...flows.initialize(buildContext),
            states: {
              data: links,
              definitions: [
                {
                  when: () => true,
                  style: {
                    strokeOpacity: (context: ChartMarkStateContext<DiagramLink>) => {
                      const focused = focusedDatum(context);
                      const connected =
                        focused.kind === "link"
                          ? context.datum.key === focused.key
                          : context.datum.sourceNode.data.id === focused.data.id ||
                            context.datum.targetNode.data.id === focused.data.id;
                      return connected ? 0.6 : 0.06;
                    },
                  },
                },
              ],
            },
          }));
          return [
            focusedFlows,
            rect(nodes, {
              id: "sankey-nodes",
              x1: "x0",
              x2: "x1",
              y1: "y0",
              y2: "y1",
              key: "key",
              inset: 0,
              color: (node) => node.data.id,
              radius: 3,
              states: [
                {
                  when: () => true,
                  style: {
                    opacity: (context) =>
                      nodeConnected(context.datum, focusedDatum(context)) ? 1 : 0.35,
                  },
                },
              ],
            }),
            labelText(
              text(labels, {
                x: labelX,
                y: ({ node }) => node.y - 3,
                text: ({ node }) => shortLabel(node.data.name, labelWidth),
                key: ({ node }) => node.key,
                anchor: labelAnchor,
                fill: chartColors.text,
                fontSize: 12,
              }),
            ),
            labelText(
              text(labels, {
                x: labelX,
                y: ({ node }) => node.y + 11,
                text: ({ node }) => formatValue(node.data.value),
                key: ({ node }) => node.key,
                anchor: labelAnchor,
                fill: chartColors.muted,
                fontSize: 11,
              }),
            ),
            rect(labels, {
              id: "category-label-targets",
              x1: ({ node }) =>
                node.x0 <= (center?.x0 ?? 0) ? node.x1 + 4 : node.x0 - 8 - labelWidth,
              x2: ({ node }) =>
                node.x0 <= (center?.x0 ?? 0) ? node.x1 + 8 + labelWidth : node.x0 - 4,
              y1: ({ node }) => node.y - 12,
              y2: ({ node }) => node.y + 18,
              key: ({ node }) => node.key,
              fill: "transparent",
              inset: 0,
            }),
          ] as const;
        },
      }),
    ],
    color: {
      domain: data.nodes.map((node) => node.id),
      range: data.nodes.map((node) => resolveColor(node.color)),
    },
    gradients: inputLinks.map((edge) => ({
      id: edge.gradientId,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      stops: [
        { offset: 0, color: resolveColor(nodesById.get(edge.source)?.color) },
        { offset: 1, color: resolveColor(nodesById.get(edge.target)?.color) },
      ],
    })),
    scales: { x: null, y: null },
    margin: 0,
    guides: false,
    maxFocusDistance: 12,
    tooltip: {
      use: chartTooltip,
      sticky: false,
      format: (point) => {
        const primary = point.datum;
        const datum = primary.kind === "label" ? primary.node : primary;
        const name =
          datum.kind === "node"
            ? datum.data.name
            : `${datum.sourceNode.data.name} → ${datum.targetNode.data.name}`;
        return `${name}\n${formatValue(datum.data.value)}\n${datum.data.percentage.toFixed(1)}%`;
      },
    },
  });
}

export type SankeyDefinition = DomChartDefinition<SankeyDatum, number, number>;
export type SankeySelection =
  | { type: "navigate"; path: string }
  | { type: "zoom"; nodeId: string | null };

// Bars zoom parents; labels and leaf bars drill down on the first activation.
// Structural nodes can never become category filters.
export function sankeySelection(
  data: SankeyGraph,
  zoomRootId: string | null,
  datum: SankeyDatum | undefined,
  period: { startDate?: string; endDate?: string } = {},
): SankeySelection | null {
  if (datum === undefined || datum.kind === "link") return null;
  const node = datum.kind === "label" ? datum.node : datum;
  let path: string | null = null;
  if (
    /^(income|expense)_/u.test(node.data.id) &&
    node.data.filter_value !== null &&
    node.data.filter_value !== ""
  ) {
    const params = new URLSearchParams();
    params.append("q[categories][]", node.data.filter_value);
    if (period.startDate !== undefined && period.startDate !== "")
      params.append("q[start_date]", period.startDate);
    if (period.endDate !== undefined && period.endDate !== "")
      params.append("q[end_date]", period.endDate);
    path = `/transactions?${params.toString()}`;
  }
  if (datum.kind === "label" && path !== null) return { type: "navigate", path };
  if (node.data.id === CASH_FLOW_NODE_ID || node.data.id === zoomRootId)
    return { type: "zoom", nodeId: null };

  if (sankeyDescendants(data, node.data.id).size > 1) return { type: "zoom", nodeId: node.data.id };
  return path === null ? null : { type: "navigate", path };
}
