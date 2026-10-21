// Cashflow sankey widget: d3-sankey layout with drill-down links,
// zoom-to-category, and an expand dialog. Mirrors sankey_chart_controller.js
// behavior: category label click navigates to filtered transactions, shape
// click zooms into the subtree, hover highlights the connected flow.
//
// Layout follows https://www.react-graph-gallery.com/sankey-diagram:
// d3 computes node/link geometry, React renders the <rect> and <path>.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
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
const MARGIN = 16;
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

type SankeyInputNode = {
  id: string;
  name: string;
  filter_value: string | null;
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

type SankeyOutNode = SankeyNode<SankeyInputNode, SankeyInputLink>;
type SankeyOutLink = SankeyLink<SankeyInputNode, SankeyInputLink>;
type SankeyEndpointPair = { source: SankeyOutNode; target: SankeyOutNode };

function useSankeyLayout(
  nodes: HomeSankeyNode[],
  links: HomeSankeyLink[],
  width: number,
  height: number,
) {
  return useMemo(() => {
    const inputNodes: SankeyInputNode[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      filter_value: node.filter_value,
      value: Math.max(node.value, 0.01),
      percentage: node.percentage,
      color: node.color,
    }));
    const inputLinks: SankeyInputLink[] = links.map((link) => {
      const source =
        nodes.at(typeof link.source === "number" ? link.source : Number(link.source))?.id ?? "";
      const target =
        nodes.at(typeof link.target === "number" ? link.target : Number(link.target))?.id ?? "";
      return {
        source,
        target,
        value: Math.max(link.value, 0.01),
        percentage: link.percentage,
        color: link.color,
      };
    });
    const generator = sankey<SankeyInputNode, SankeyInputLink>()
      .nodeId((node) => node.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .extent([
        [MARGIN, MARGIN],
        [width - MARGIN, height - MARGIN],
      ]);
    return generator({ nodes: inputNodes, links: inputLinks });
  }, [nodes, links, width, height]);
}

function linkEnds(link: SankeyOutLink): SankeyEndpointPair | null {
  if (typeof link.source !== "object" || typeof link.target !== "object") return null;
  return { source: link.source, target: link.target };
}
function formatCurrency(value: number, symbol: string): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

function descendantsOf(
  nodes: HomeSankeyNode[],
  links: HomeSankeyLink[],
  rootId: string,
): Set<string> {
  const outbound = new Map<number, number[]>();
  const inbound = new Map<number, number[]>();
  const normalized = links.map((link) => ({
    source: typeof link.source === "number" ? link.source : Number(link.source),
    target: typeof link.target === "number" ? link.target : Number(link.target),
  }));
  for (const link of normalized) {
    const outgoing = outbound.get(link.source) ?? [];
    outgoing.push(link.target);
    outbound.set(link.source, outgoing);
    const incoming = inbound.get(link.target) ?? [];
    incoming.push(link.source);
    inbound.set(link.target, incoming);
  }
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
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
  const rootIndex = indexById.get(rootId);
  if (rootIndex === undefined) return new Set([rootId]);
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
    const childNodes = childrenOf(queue[head]);
    for (const child of childNodes) {
      if (!Object.hasOwn(nodes, child)) continue;
      const id = nodes[child].id;
      if (included.has(id)) continue;
      included.add(id);
      queue.push(child);
    }
  }
  return included;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(
    () =>
      typeof ResizeObserver !== "undefined" && containerRef.current !== null
        ? (() => {
            const target = containerRef.current as HTMLElement;
            const observer = new ResizeObserver((entries) => {
              const entry = entries.at(0);
              if (entry !== undefined) setMeasuredWidth(entry.contentRect.width);
            });
            observer.observe(target);
            return () => {
              observer.disconnect();
            };
          })()
        : undefined,
    [],
  );

  const width = Math.max(measuredWidth, 320);

  const visible = useMemo(() => {
    if (zoomRootId === null || zoomRootId === "") return data;
    const included = descendantsOf(data.nodes, data.links, zoomRootId);
    if (included.size <= 1) return data;
    const kept = new Set([...included, CASH_FLOW_NODE_ID]);
    const keptNodes = data.nodes.filter((node) => kept.has(node.id));
    const indexById = new Map(keptNodes.map((node, index) => [node.id, index]));
    const keptLinks = data.links.filter((link) => {
      const source = data.nodes.at(
        typeof link.source === "number" ? link.source : Number(link.source),
      )?.id;
      const target = data.nodes.at(
        typeof link.target === "number" ? link.target : Number(link.target),
      )?.id;
      return source !== undefined && target !== undefined && kept.has(source) && kept.has(target);
    });
    const reindexed: HomeSankeyLink[] = keptLinks.map((link) => ({
      value: link.value,
      percentage: "percentage" in link && typeof link.percentage === "number" ? link.percentage : 0,
      color: "color" in link && typeof link.color === "string" ? link.color : null,
      source:
        indexById.get(
          data.nodes.at(typeof link.source === "number" ? link.source : Number(link.source))?.id ??
            "",
        ) ?? 0,
      target:
        indexById.get(
          data.nodes.at(typeof link.target === "number" ? link.target : Number(link.target))?.id ??
            "",
        ) ?? 0,
    }));
    return { ...data, nodes: keptNodes, links: reindexed };
  }, [data, zoomRootId]);

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

  const { nodes, links }: { nodes: SankeyOutNode[]; links: SankeyOutLink[] } = useSankeyLayout(
    visible.nodes,
    visible.links,
    width,
    height,
  );
  const linkPath = sankeyLinkHorizontal();

  const connected = (node: SankeyOutNode): boolean => {
    if (hovered === null) return true;
    return links.some((link) => link.source === node || link.target === node);
  };

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
      <div className="min-h-0 flex-1" ref={containerRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="privacy-sensitive size-full"
          aria-label={text.dialogTitle}
          preserveAspectRatio="xMidYMid meet"
        >
          <g fill="none">
            {links.map((link) => {
              const ends = linkEnds(link);
              if (ends === null) return null;
              const dimmed =
                hovered !== null && ends.source.id !== hovered && ends.target.id !== hovered;
              const path = linkPath(link);
              if (path === null || link.width === undefined) return null;
              return (
                <path
                  key={`${ends.source.id}-${ends.target.id}-${link.value}`}
                  d={path}
                  stroke={resolveColor(ends.source.color)}
                  strokeOpacity={dimmed ? 0.15 : 0.35}
                  strokeWidth={Math.max(1, link.width)}
                  fill="none"
                >
                  <title>{`${ends.source.id} → ${ends.target.id}: ${formatCurrency(link.value, currencySymbol)}`}</title>
                </path>
              );
            })}
          </g>
          <g>
            {nodes.map((node) => {
              const nodeId = node.id;
              const x0 = node.x0 ?? 0;
              const x1 = node.x1 ?? 0;
              const y0 = node.y0 ?? 0;
              const y1 = node.y1 ?? 0;
              const nodeWidth = Math.max(1, x1 - x0);
              const nodeHeight = Math.max(4, y1 - y0);
              const dimmed = hovered !== null && !connected(node);
              const navigable = isNavigableCategoryNode(nodeId);
              const zoomable = hasChildren[nodeId] ?? false;
              const path =
                node.filter_value === null
                  ? null
                  : categoryTransactionsPath({
                      filterValue: node.filter_value,
                      startDate,
                      endDate,
                    });
              const leftSide = x0 < width / 2;
              const labelX = leftSide ? x1 + 8 : x0 - 8;
              const anchor = leftSide ? "start" : "end";
              const label = (
                <g
                  opacity={dimmed ? 0.4 : 1}
                  onMouseEnter={() => {
                    setHovered(nodeId);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                >
                  <text
                    x={labelX}
                    y={y0 + nodeHeight / 2 - 2}
                    textAnchor={anchor}
                    className="fill-current text-xs font-medium"
                  >
                    {node.name}
                  </text>
                  <text
                    x={labelX}
                    y={y0 + nodeHeight / 2 + 12}
                    textAnchor={anchor}
                    className="fill-current font-mono"
                    fontSize="10"
                    opacity={0.75}
                  >
                    {formatCurrency(node.value, currencySymbol)}
                  </text>
                  <title>{`${node.name}: ${formatCurrency(node.value, currencySymbol)}`}</title>
                </g>
              );
              return (
                <g key={nodeId} opacity={dimmed ? 0.4 : 1}>
                  <rect
                    x={x0}
                    y={y0}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={4}
                    fill={resolveColor(node.color)}
                    stroke={node.color === "" ? "var(--color-gray-500)" : "none"}
                    style={{ cursor: navigable || zoomable ? "pointer" : "default" }}
                    onMouseEnter={() => {
                      setHovered(nodeId);
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                    }}
                    onClick={() => {
                      if (nodeId !== "") onZoom(nodeId);
                    }}
                  >
                    <title>{`${node.name}: ${formatCurrency(node.value, currencySymbol)}`}</title>
                  </rect>
                  {navigable && path !== null ? (
                    <Link
                      to={path}
                      aria-label={`${node.name}: ${formatCurrency(node.value, currencySymbol)}`}
                    >
                      {label}
                    </Link>
                  ) : (
                    <g
                      style={{ cursor: zoomable ? "pointer" : "default" }}
                      onClick={() => {
                        if (zoomable && nodeId !== "") onZoom(nodeId);
                      }}
                    >
                      {label}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <ul className="sr-only">
          {nodes.map((node) => (
            <li key={node.id}>
              {node.name}: {formatCurrency(node.value, currencySymbol)}
            </li>
          ))}
        </ul>
      </div>
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
