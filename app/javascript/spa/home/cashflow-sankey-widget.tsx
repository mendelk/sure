// TanStack owns Sankey geometry, gradients, focus, and keyboard navigation.
// Dense dashboard graphs retain proportional ribbons and collision-free labels;
// expanded graphs get enough vertical space for detailed inspection.
import { useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Chart } from "@tanstack/charts/react";
import {
  sankeyChartSize,
  sankeyDefinition,
  sankeySelection,
  visibleSankeyGraph,
} from "../../charts/sankey";
import { Modal } from "../modal";
import type { HomeSankey } from "./home-api";

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
  const focusAfterRender = useRef<string | null>(null);
  const visible = useMemo(() => visibleSankeyGraph(data, zoomRootId), [data, zoomRootId]);
  const formatValue = useMemo(
    () => (value: number) =>
      `${currencySymbol}${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    [currencySymbol],
  );
  const definition = useMemo(
    () => sankeyDefinition(visible, { expanded, formatValue }),
    [visible, expanded, formatValue],
  );
  const size = useMemo(
    () => sankeyChartSize(visible, height, expanded),
    [visible, height, expanded],
  );

  return (
    <div className="relative w-full">
      {zoomRootId !== null && zoomRootId !== "" ? (
        <button
          type="button"
          title={text.zoomOut}
          aria-label={text.zoomOut}
          onClick={() => {
            focusAfterRender.current = zoomRootId;
            onZoom(null);
          }}
          className="absolute top-0 left-4 z-10 rounded-md bg-container px-2 py-1 text-xs font-medium text-secondary hover:bg-container-inset-hover hover:text-primary"
        >
          ← {text.zoomOut}
        </button>
      ) : null}
      <div className="overflow-x-auto">
        <div style={{ minWidth: size.minWidth }}>
          <Chart
            ariaLabel={text.dialogTitle}
            definition={definition}
            height={size.height}
            idPrefix={chartId}
            onRender={(context) => {
              if (focusAfterRender.current === null) return;
              const nodeId = focusAfterRender.current;
              focusAfterRender.current = null;
              const point = context.scene.points.find(
                (candidate) =>
                  candidate.datum.kind === "node" && candidate.datum.data.id === nodeId,
              );
              context.svg.focus({ preventScroll: true });
              if (point) context.interaction.setControlledFocus(point);
            }}
            onSelect={(point) => {
              const selection = sankeySelection(data, zoomRootId, point?.datum, {
                startDate,
                endDate,
              });
              if (selection?.type === "navigate") void navigate({ to: selection.path });
              else if (selection?.type === "zoom") {
                const datum = point?.datum;
                focusAfterRender.current =
                  datum?.kind === "label"
                    ? datum.node.data.id
                    : datum?.kind === "node"
                      ? datum.data.id
                      : null;
                onZoom(selection.nodeId);
              }
            }}
          />
        </div>
      </div>
      <ul className="sr-only">
        {visible.nodes.map((node) => (
          <li key={node.id}>
            {node.name}: {formatValue(node.value)}
          </li>
        ))}
      </ul>
    </div>
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
  const expandedTitleId = useId();

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
        ariaLabelledby={expandedTitleId}
      >
        <div className="mb-2 flex items-center justify-between px-4">
          <h2 id={expandedTitleId} className="text-base font-medium">
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
