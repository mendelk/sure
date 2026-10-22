// TanStack owns Sankey geometry, gradients, focus, and keyboard navigation.
// Dense dashboard graphs retain proportional ribbons and collision-free labels;
// expanded graphs get enough vertical space for detailed inspection.
import { useId, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { createMark, defineChart, link, rect, text as textMark } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { sankeyDiagram } from "@tanstack/charts/network/sankey";
import { tooltip } from "@tanstack/charts/tooltip";
import type { SankeyLink, SankeyNode } from "@tanstack/charts/network/sankey";
import type { ChartMarkStateContext } from "@tanstack/charts";
import { hiddenSankeyLabels } from "../../utils/sankey_labels.mjs";
import { Modal } from "../modal";
import type { HomeSankey, HomeSankeyLink, HomeSankeyNode } from "./home-api";

export type SankeyData = HomeSankey;

export type CashflowSankeyText = {
  noDataTitle: string;
  noDataDescription: string;
  addTransaction: string;
  zoomOut: string;
  expand: string;
  close: string;
  dialogTitle: string;
};

const DEFAULT_TEXT: CashflowSankeyText = {
  noDataTitle: "No cash flow data for this time period",
  noDataDescription: "Add transactions to display cash flow data or expand the time period",
  addTransaction: "Add transaction",
  zoomOut: "Back to full cashflow",
  expand: "Expand",
  close: "Close",
  dialogTitle: "Cashflow",
};

const CASH_FLOW_NODE_ID = "cash_flow_node";
const NODE_WIDTH = 15;
const EXTENT_MARGIN = 16;
const MIN_LABEL_SPACING = 32;

function resolveColor(color: string | null | undefined): string {
  return color === null || color === undefined || color === ""
    ? "var(--utility-text-subdued)"
    : color;
}

function categoryTransactionsPath({
  filterValue,
  startDate,
  endDate,
}: {
  filterValue: string | null;
  startDate?: string;
  endDate?: string;
}): string | null {
  if (filterValue === null || filterValue === "") return null;
  const params = new URLSearchParams();
  params.append("q[categories][]", filterValue);
  if (startDate !== undefined && startDate !== "") params.append("q[start_date]", startDate);
  if (endDate !== undefined && endDate !== "") params.append("q[end_date]", endDate);
  return `/transactions?${params.toString()}`;
}

function formatCurrency(value: number, symbol: string): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

type SankeyInputNode = {
  id: string;
  name: string;
  filterValue: string | null;
  value: number;
  percentage: number;
  color: string | null;
};

type SankeyInputLink = {
  source: string;
  target: string;
  value: number;
  percentage: number;
  color: string | null;
  gradientId: string;
};

// Horizontal bezier for sankey flows: d3's sankeyLinkHorizontal shape
// adapted to the ChartCurve interface (two-point line + cubic path).
const horizontalLinkCurve = {
  line: (points: readonly (readonly [number, number])[]) => {
    const first = points.at(0);
    const last = points.at(-1);
    if (first === undefined || last === undefined) return "";
    const [x1, y1] = first;
    const [x2, y2] = last;
    const curve = Math.max(24, (x2 - x1) / 2);
    return `M ${x1},${y1} C ${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`;
  },
  area: (
    _top: readonly (readonly [number, number])[],
    _bottom: readonly (readonly [number, number])[],
  ) => "",
};

type DiagramNode = SankeyNode<SankeyInputNode, SankeyInputLink>;
type DiagramLink = SankeyLink<SankeyInputNode, SankeyInputLink>;
type DiagramLabel = { kind: "label"; node: DiagramNode };
type DiagramDatum = DiagramNode | DiagramLink | DiagramLabel;

function graphColumns(nodes: SankeyInputNode[], links: SankeyInputLink[]) {
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const depths = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of links) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
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
  for (const node of nodes) {
    const layer = outgoing.get(node.id)?.length === 0 ? lastLayer : (depths.get(node.id) ?? 0);
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return { count: lastLayer + 1, largest: Math.max(1, ...counts.values()) };
}

function shortLabel(name: string, width: number): string {
  const characters = Array.from(name);
  const limit = Math.max(8, Math.floor(width / 7));
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : name;
}

function descendantsOf(
  nodes: HomeSankeyNode[],
  links: HomeSankeyLink[],
  rootId: string,
): Set<string> {
  const outbound = new Map<number, number[]>();
  const inbound = new Map<number, number[]>();
  const idByIndex = new Map(nodes.map((node, index) => [index, node.id]));
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const normalized = links.map((edge) => ({
    source: typeof edge.source === "number" ? edge.source : -1,
    target: typeof edge.target === "number" ? edge.target : -1,
  }));
  for (const edge of normalized) {
    if (edge.source < 0 || edge.target < 0) continue;
    const outgoing = outbound.get(edge.source) ?? [];
    outgoing.push(edge.target);
    outbound.set(edge.source, outgoing);
    const incoming = inbound.get(edge.target) ?? [];
    incoming.push(edge.source);
    inbound.set(edge.target, incoming);
  }
  const rootIndex = indexById.get(rootId);
  if (rootIndex === undefined) return new Set([rootId]);
  const cashFlowIndex = indexById.get(CASH_FLOW_NODE_ID);
  const reachable = (from: number, to: number): boolean => {
    if (from === to) return true;
    const visited = new Set([from]);
    const queue: number[] = [from];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const next of outbound.get(current) ?? []) {
        if (next === to) return true;
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    return false;
  };
  const childrenOf = (nodeIndex: number): number[] => {
    if (nodeIndex === cashFlowIndex) return outbound.get(nodeIndex) ?? [];
    if (cashFlowIndex !== undefined && reachable(cashFlowIndex, nodeIndex))
      return outbound.get(nodeIndex) ?? [];
    if (cashFlowIndex !== undefined && reachable(nodeIndex, cashFlowIndex))
      return inbound.get(nodeIndex) ?? [];
    return [];
  };
  const included = new Set([rootId]);
  const queue: number[] = [rootIndex];
  for (let head = 0; head < queue.length; head += 1) {
    for (const child of childrenOf(queue[head])) {
      const id = idByIndex.get(child);
      if (id === undefined || included.has(id)) continue;
      included.add(id);
      queue.push(child);
    }
  }
  return included;
}

function visibleGraph(data: SankeyData, zoomRootId: string | null) {
  if (zoomRootId === null || zoomRootId === "") return data;
  const included = descendantsOf(data.nodes, data.links, zoomRootId);
  if (included.size <= 1) return data;
  const kept = new Set([...included, CASH_FLOW_NODE_ID]);
  const root = data.nodes.find((node) => node.id === zoomRootId);
  if (root === undefined) return data;
  const keptNodes = data.nodes
    .filter((node) => kept.has(node.id))
    .map((node) =>
      node.id === CASH_FLOW_NODE_ID
        ? {
            id: node.id,
            name: node.name,
            filter_value: node.filter_value,
            value: root.value,
            percentage: root.percentage,
            color: node.color,
          }
        : node,
    );
  const keptLinks = data.links.filter((edge) => {
    const source = typeof edge.source === "number" ? data.nodes[edge.source]?.id : edge.source;
    const target = typeof edge.target === "number" ? data.nodes[edge.target]?.id : edge.target;
    return (
      typeof source === "string" &&
      typeof target === "string" &&
      kept.has(source) &&
      kept.has(target)
    );
  });
  return {
    ...data,
    nodes: keptNodes,
    links: keptLinks.map((edge) => ({
      value: edge.value,
      color: edge.color,
      percentage: edge.percentage,
      source: typeof edge.source === "number" ? data.nodes[edge.source].id : edge.source,
      target: typeof edge.target === "number" ? data.nodes[edge.target].id : edge.target,
    })),
  };
}

function SankeyDiagram({
  data,
  height,
  expanded = false,
  currencySymbol,
  startDate,
  endDate,
  text,
  zoomRootId,
  onZoom,
}: {
  data: SankeyData;
  height: number;
  expanded?: boolean;
  currencySymbol: string;
  startDate?: string;
  endDate?: string;
  text: CashflowSankeyText;
  zoomRootId: string | null;
  onZoom: (nodeId: string | null) => void;
}) {
  const chartId = useId();
  const navigate = useNavigate();
  const visible = useMemo(() => visibleGraph(data, zoomRootId), [data, zoomRootId]);
  const inputNodes: SankeyInputNode[] = useMemo(
    () =>
      visible.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        filterValue: node.filter_value,
        value: node.value,
        percentage: node.percentage,
        color: node.color,
      })),
    [visible],
  );
  const inputLinks: SankeyInputLink[] = useMemo(
    () =>
      visible.links.map((edge, index) => ({
        source: typeof edge.source === "number" ? visible.nodes[edge.source].id : edge.source,
        target: typeof edge.target === "number" ? visible.nodes[edge.target].id : edge.target,
        value: edge.value,
        percentage: edge.percentage,
        color: edge.color,
        gradientId: `flow-${index}`,
      })),
    [visible],
  );
  const columns = useMemo(() => graphColumns(inputNodes, inputLinks), [inputNodes, inputLinks]);
  const chartHeight = expanded
    ? Math.max(height, columns.largest * 44 + EXTENT_MARGIN * 4)
    : height;
  const definition = useMemo(() => {
    const nodesById = new Map(inputNodes.map((node) => [node.id, node]));
    return defineChart({
      marks: [
        sankeyDiagram({
          nodes: inputNodes,
          links: inputLinks,
          nodeKey: "id",
          source: "source",
          target: "target",
          value: "value",
          nodeWidth: NODE_WIDTH,
          nodePadding: ({ height: availableHeight }) =>
            expanded
              ? MIN_LABEL_SPACING
              : Math.min(
                  20,
                  ((availableHeight - EXTENT_MARGIN * 4) * 0.35) / Math.max(columns.largest - 1, 1),
                ),
          inset: { left: 12, right: 12, top: 32, bottom: 16 },
          marks: ({ nodes: layoutNodes, links: layoutLinks, chart }) => {
            const hidden = hiddenSankeyLabels(layoutNodes, {
              height: chart.height,
              minSpacing: chart.height > 600 ? MIN_LABEL_SPACING / 0.7 : MIN_LABEL_SPACING,
            });
            const labels: DiagramLabel[] = layoutNodes
              .filter((node) => !hidden.has(node.index))
              .map((node) => ({ kind: "label", node }));
            const center = layoutNodes.find((node) => node.data.id === CASH_FLOW_NODE_ID);
            const labelX = ({ node }: DiagramLabel) =>
              node.x0 <= (center?.x0 ?? 0) ? node.x1 + 8 : node.x0 - 8;
            const labelAnchor = ({ node }: DiagramLabel) =>
              node.x0 <= (center?.x0 ?? 0) ? ("start" as const) : ("end" as const);
            const labelWidth = Math.min(
              176,
              ((chart.width - 24) / Math.max(columns.count - 1, 1)) * 0.45,
            );
            const flowMark = link(layoutLinks, {
              x1: "x1",
              y1: "y1",
              x2: "x2",
              y2: "y2",
              key: "key",
              curve: horizontalLinkCurve,
              strokeWidth: (flow) => Math.max(1, flow.width),
              stroke: (flow) => `url(#${flow.data.gradientId})`,
              strokeOpacity: 0.25,
              lineCap: "butt",
            });
            // Link has no states option; compose native focus styling without
            // rebuilding the Sankey definition and disrupting pointer selection.
            const focusedFlows = createMark((context) => ({
              ...flowMark.initialize(context),
              states: {
                data: layoutLinks,
                definitions: [
                  {
                    when: () => true,
                    style: {
                      strokeOpacity: ({ datum, focus }: ChartMarkStateContext<DiagramLink>) => {
                        const primary = focus.primary.datum as DiagramDatum;
                        const focused = primary.kind === "label" ? primary.node : primary;
                        const connected =
                          focused.kind === "link"
                            ? datum.key === focused.key
                            : datum.sourceNode.data.id === focused.data.id ||
                              datum.targetNode.data.id === focused.data.id;
                        return connected ? 0.6 : 0.06;
                      },
                    },
                  },
                ],
              },
            }));
            return [
              focusedFlows,
              rect(layoutNodes, {
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
                      opacity: ({ datum, focus }) => {
                        const primary = focus.primary.datum as DiagramDatum;
                        const focused = primary.kind === "label" ? primary.node : primary;
                        const connected =
                          focused.kind === "node"
                            ? datum.data.id === focused.data.id
                            : datum.data.id === focused.sourceNode.data.id ||
                              datum.data.id === focused.targetNode.data.id;
                        return connected ? 1 : 0.35;
                      },
                    },
                  },
                ],
              }),
              textMark(labels, {
                x: labelX,
                y: ({ node }) => node.y - 3,
                text: ({ node }) => shortLabel(node.data.name, labelWidth),
                key: ({ node }) => node.key,
                anchor: labelAnchor,
                fill: "var(--utility-text-primary)",
                fontSize: 12,
              }),
              textMark(labels, {
                x: labelX,
                y: ({ node }) => node.y + 11,
                text: ({ node }) => formatCurrency(node.data.value, currencySymbol),
                key: ({ node }) => node.key,
                anchor: labelAnchor,
                fill: "var(--utility-text-secondary)",
                fontSize: 11,
              }),
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
        domain: inputNodes.map((node) => node.id),
        range: inputNodes.map((node) => resolveColor(node.color)),
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
        use: tooltip,
        sticky: false,
        className: "rounded-lg border border-primary bg-container p-3 text-primary shadow-md",
        format: (point) => {
          const primary = point.datum;
          const datum = primary.kind === "label" ? primary.node : primary;
          const name =
            datum.kind === "node"
              ? datum.data.name
              : `${datum.sourceNode.data.name} → ${datum.targetNode.data.name}`;
          return `${name}\n${formatCurrency(datum.data.value, currencySymbol)}\n${datum.data.percentage.toFixed(1)}%`;
        },
      },
    });
  }, [inputNodes, inputLinks, columns, expanded, currencySymbol]);

  const activateNode = (node: DiagramNode, action: "navigate" | "zoom") => {
    const categoryPath = /^(income|expense)_/u.test(node.data.id)
      ? categoryTransactionsPath({ filterValue: node.data.filterValue, startDate, endDate })
      : null;
    if (action === "navigate" && categoryPath !== null) void navigate({ to: categoryPath });
    else if (node.data.id === CASH_FLOW_NODE_ID || node.data.id === zoomRootId) onZoom(null);
    else if (descendantsOf(data.nodes, data.links, node.data.id).size > 1) onZoom(node.data.id);
    else if (categoryPath !== null) void navigate({ to: categoryPath });
  };

  return (
    <div className="relative w-full">
      {zoomRootId !== null && zoomRootId !== "" ? (
        <button
          type="button"
          title={text.zoomOut}
          aria-label={text.zoomOut}
          onClick={() => {
            onZoom(null);
          }}
          className="absolute top-0 left-4 z-10 rounded-md bg-container px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary"
        >
          ← {text.zoomOut}
        </button>
      ) : null}
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(320, columns.count * 160) }}>
          <Chart
            ariaLabel={text.dialogTitle}
            definition={definition}
            height={chartHeight}
            idPrefix={chartId}
            onSelect={(point) => {
              const datum = point?.datum;
              if (datum?.kind === "node") activateNode(datum, "zoom");
              else if (datum?.kind === "label") activateNode(datum.node, "navigate");
            }}
          />
        </div>
      </div>
      <ul className="sr-only">
        {visible.nodes.map((node) => (
          <li key={node.id}>
            {node.name}: {formatCurrency(node.value, currencySymbol)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CashflowSankeyChart({
  data,
  startDate,
  endDate,
  height = 384,
  text = DEFAULT_TEXT,
}: {
  data: SankeyData;
  startDate?: string;
  endDate?: string;
  height?: number;
  text?: CashflowSankeyText;
}) {
  const [zoomRootId, setZoomRootId] = useState<string | null>(null);
  if (data.links.length === 0) return null;
  return (
    <SankeyDiagram
      data={data}
      height={height}
      currencySymbol={data.currency_symbol}
      startDate={startDate}
      endDate={endDate}
      text={text}
      zoomRootId={zoomRootId}
      onZoom={setZoomRootId}
    />
  );
}

export function CashflowSankeyWidget({
  sankey: sankeyData,
  startDate,
  endDate,
  newTransactionPath,
  text = DEFAULT_TEXT,
}: {
  sankey: SankeyData;
  startDate?: string;
  endDate?: string;
  newTransactionPath?: string;
  text?: CashflowSankeyText;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoomRootId, setZoomRootId] = useState<string | null>(null);

  if (sankeyData.links.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center bg-container py-4 lg:h-[340px]">
        <div className="flex flex-col items-center space-y-3 text-center">
          <p className="text-sm font-medium text-primary">{text.noDataTitle}</p>
          <p className="text-sm text-secondary">{text.noDataDescription}</p>
          {newTransactionPath !== undefined && newTransactionPath !== "" ? (
            <Link to={newTransactionPath} className="text-sm font-medium hover:underline">
              + {text.addTransaction}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-96 w-full">
        <button
          type="button"
          aria-label={text.expand}
          onClick={() => {
            setExpanded(true);
          }}
          className="absolute top-0 right-4 z-10 rounded-md px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary"
        >
          {text.expand}
        </button>
        <SankeyDiagram
          data={sankeyData}
          height={384}
          currencySymbol={sankeyData.currency_symbol}
          startDate={startDate}
          endDate={endDate}
          text={text}
          zoomRootId={zoomRootId}
          onZoom={setZoomRootId}
        />
      </div>
      <Modal
        open={expanded}
        onClose={() => {
          setExpanded(false);
        }}
        panelClassName="w-[min(72rem,calc(100vw-2rem))] rounded-xl border border-primary bg-container p-4"
        ariaLabelledby="cashflow-expanded-title"
      >
        <div className="mb-2 flex items-center justify-between px-4">
          <h2 id="cashflow-expanded-title" className="text-base font-medium">
            {text.dialogTitle}
          </h2>
          <button
            type="button"
            aria-label={text.close}
            onClick={() => {
              setExpanded(false);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary"
          >
            {text.close}
          </button>
        </div>
        <div className="mb-2 max-h-[80dvh] w-full overflow-auto overscroll-contain">
          <SankeyDiagram
            data={sankeyData}
            height={640}
            expanded
            currencySymbol={sankeyData.currency_symbol}
            startDate={startDate}
            endDate={endDate}
            text={text}
            zoomRootId={zoomRootId}
            onZoom={setZoomRootId}
          />
        </div>
      </Modal>
    </div>
  );
}
