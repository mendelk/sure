// Cashflow sankey widget: TanStack sankeyDiagram layout with drill-down
// links, zoom-to-category, and an expand dialog. Mirrors
// sankey_chart_controller.js behavior: category label click navigates to
// filtered transactions, shape click zooms into the subtree, hover
// highlights the connected flow.
//
// Layout follows the TanStack sankey reference: sankeyDiagram computes
// geometry in final pixels, ordinary link/rect/text marks render it.
// Numbers are server-computed; render verbatim.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { defineChart, link, rect, text as textMark } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { sankeyDiagram } from "@tanstack/charts/network/sankey";
import type { SankeyLink, SankeyNode } from "@tanstack/charts/network/sankey";
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
const CSS_VAR_MAP: Record<string, string> = {
  "var(--color-success)": "#10A861",
  "var(--color-destructive)": "#EC2222",
  "var(--color-gray-400)": "#9E9E9E",
  "var(--color-gray-500)": "#737373",
};
const NODE_WIDTH = 15;
const NODE_PADDING = 20;
function isNavigableCategoryNode(id: string): boolean {
  return /^(income|expense)_/u.test(id);
}

function resolveColor(color: string | null | undefined): string {
  if (color === null || color === undefined || color === "")
    return CSS_VAR_MAP["var(--color-gray-400)"] ?? "#9E9E9E";
  return CSS_VAR_MAP[color] ?? color;
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
  const keptNodes = data.nodes.filter((node) => kept.has(node.id));
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
  return { ...data, nodes: keptNodes, links: keptLinks };
}

function SankeyDiagram({
  data,
  height,
  currencySymbol,
  startDate,
  endDate,
  text,
  zoomRootId,
  onZoom,
}: {
  data: SankeyData;
  height: number;
  currencySymbol: string;
  startDate?: string;
  endDate?: string;
  text: CashflowSankeyText;
  zoomRootId: string | null;
  onZoom: (nodeId: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const navigate = useNavigate();

  const visible = useMemo(() => visibleGraph(data, zoomRootId), [data, zoomRootId]);

  const inputNodes: SankeyInputNode[] = useMemo(
    () =>
      visible.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        filterValue: node.filter_value,
        value: Math.max(node.value, 0.01),
        percentage: node.percentage,
        color: node.color,
      })),
    [visible],
  );
  const inputLinks: SankeyInputLink[] = useMemo(
    () =>
      visible.links.map((edge) => {
        const source =
          typeof edge.source === "number" ? (visible.nodes[edge.source]?.id ?? "") : edge.source;
        const target =
          typeof edge.target === "number" ? (visible.nodes[edge.target]?.id ?? "") : edge.target;
        return {
          source,
          target,
          value: Math.max(edge.value, 0.01),
          percentage: edge.percentage,
          color: edge.color,
        };
      }),
    [visible],
  );

  const hasChildren = useMemo(() => {
    const entries: Record<string, boolean> = {};
    for (const node of data.nodes) {
      if (node.id === "") {
        entries[node.id] = false;
        continue;
      }
      entries[node.id] = descendantsOf(data.nodes, data.links, node.id).size > 1;
    }
    return entries;
  }, [data]);

  const activateNode = (nodeId: string) => {
    const node = visible.nodes.find((candidate) => candidate.id === nodeId);
    if (nodeId !== "" && isNavigableCategoryNode(nodeId)) {
      const path =
        node?.filter_value === null || node?.filter_value === undefined
          ? null
          : categoryTransactionsPath({ filterValue: node.filter_value, startDate, endDate });
      if (path !== null) {
        void navigate({ to: path });
        return;
      }
    }
    if (nodeId !== "" && (hasChildren[nodeId] ?? false)) onZoom(nodeId);
    else onZoom(nodeId);
  };
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          sankeyDiagram({
            nodes: inputNodes.map((node) => ({ ...node, fill: resolveColor(node.color) })),
            links: inputLinks.map((edge) => ({
              ...edge,
              stroke: resolveColor(
                inputNodes.find((node) => node.id === edge.source)?.color ?? null,
              ),
            })),
            nodeKey: "id",
            source: "source",
            target: "target",
            value: "value",
            nodeWidth: NODE_WIDTH,
            nodePadding: NODE_PADDING,
            inset: { left: 150, right: 150, top: 16, bottom: 16 },
            marks: ({ nodes: layoutNodes, links: layoutLinks }) =>
              [
                link(layoutLinks, {
                  x1: "x1",
                  y1: "y1",
                  x2: "x2",
                  y2: "y2",
                  key: "key",
                  curve: horizontalLinkCurve,
                  strokeWidth: (flow: SankeyLink<SankeyInputNode, SankeyInputLink>) =>
                    Math.max(1, flow.width),
                  stroke: (flow: SankeyLink<SankeyInputNode, SankeyInputLink>) =>
                    resolveColor(flow.sourceNode.data.color),
                  strokeOpacity: (flow: SankeyLink<SankeyInputNode, SankeyInputLink>) =>
                    hovered === null ||
                    flow.sourceNode.data.id === hovered ||
                    flow.targetNode.data.id === hovered
                      ? 0.35
                      : 0.15,
                  lineCap: "butt",
                }),
                rect(layoutNodes, {
                  x1: "x0",
                  x2: "x1",
                  y1: "y0",
                  y2: "y1",
                  key: "key",
                  inset: 0,
                  fill: "fill",
                }),
                textMark(layoutNodes, {
                  x: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    node.depth <= 1 ? node.x1 + 8 : node.x0 - 8,
                  y: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    (node.y0 + node.y1) / 2 - 2,
                  text: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) => node.data.name,
                  key: "key",
                  anchor: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    node.depth <= 1 ? "start" : "end",
                }),
                textMark(layoutNodes, {
                  x: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    node.depth <= 1 ? node.x1 + 8 : node.x0 - 8,
                  y: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    (node.y0 + node.y1) / 2 + 12,
                  text: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    formatCurrency(node.data.value, currencySymbol),
                  key: "key",
                  anchor: (node: SankeyNode<SankeyInputNode, SankeyInputLink>) =>
                    node.depth <= 1 ? "start" : "end",
                }),
              ] as const,
          }),
        ],
        scales: { x: null, y: null },
        guides: false,
      }),
    [inputNodes, inputLinks, currencySymbol, hovered],
  );

  return (
    <div className="flex size-full flex-col gap-2">
      <div className="flex min-h-6 justify-start px-4">
        {zoomRootId !== null && zoomRootId !== "" ? (
          <button
            type="button"
            title={text.zoomOut}
            aria-label={text.zoomOut}
            onClick={() => {
              onZoom(null);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary"
          >
            ← {text.zoomOut}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <Chart ariaLabel={text.dialogTitle} definition={definition} height={height} />
        <ul className="sr-only">
          {data.nodes.map((node) => (
            <li key={node.id}>
              {node.name}: {formatCurrency(node.value, currencySymbol)}
            </li>
          ))}
        </ul>
      </div>
      <ul aria-label={`${text.dialogTitle} categories`} className="flex flex-wrap gap-1 px-4">
        {visible.nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => {
                activateNode(node.id);
              }}
              onMouseEnter={() => {
                setHovered(node.id);
              }}
              onMouseLeave={() => {
                setHovered(null);
              }}
              onFocus={() => {
                setHovered(node.id);
              }}
              onBlur={() => {
                setHovered(null);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary focus-visible:outline-2"
            >
              {node.name}
            </button>
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
        <div className="mb-2 flex h-[85dvh] max-h-[90dvh] w-full overflow-y-auto overscroll-contain">
          <SankeyDiagram
            data={sankeyData}
            height={640}
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
