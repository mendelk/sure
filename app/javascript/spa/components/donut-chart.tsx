import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Chart } from "@tanstack/charts/react";
import type { ChartRenderContext } from "@tanstack/charts";
import {
  paintPolarFocus,
  polarDefinition,
  type PolarDatum,
  type PolarSlice,
} from "../../charts/polar";

export function DonutChart<T extends PolarSlice>({
  slices,
  ariaLabel,
  height = 300,
  innerRadiusRatio = 0.78,
  interactive = true,
  highlightedId = null,
  opacity = 1,
  onHover,
  onSelect,
  children,
}: {
  slices: readonly T[];
  ariaLabel: string;
  height?: number;
  innerRadiusRatio?: number;
  interactive?: boolean;
  highlightedId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (slice: T) => void;
  children?: ReactNode;
  opacity?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const context = useRef<ChartRenderContext<PolarDatum<T>, number, number> | null>(null);
  const activeId = useRef<string | null>(null);
  const definition = useMemo(
    () => polarDefinition(slices, { innerRadiusRatio, interactive, opacity, gapAngle: 0.005 }),
    [slices, innerRadiusRatio, interactive, opacity],
  );
  const paint = useCallback((id: string | null) => {
    if (container.current && context.current)
      paintPolarFocus(container.current, context.current.scene.points, id);
  }, []);
  const handleRender = useCallback(
    (next: ChartRenderContext<PolarDatum<T>, number, number>) => {
      context.current = next;
      paint(activeId.current);
    },
    [paint],
  );
  useEffect(() => {
    const current = context.current;
    if (!current) return;
    const point =
      highlightedId === null
        ? null
        : (current.scene.points.find((item) => item.datum.source[0].id === highlightedId) ?? null);
    current.interaction.setControlledFocus(point);
    paint(highlightedId);
  }, [highlightedId, paint]);

  return (
    <div ref={container} className="relative" style={{ height }}>
      <Chart
        definition={definition}
        height={height}
        ariaLabel={ariaLabel}
        onRender={handleRender}
        onFocusChange={(point) => {
          activeId.current = point?.datum.source[0].id ?? null;
          paint(activeId.current);
          onHover?.(activeId.current);
        }}
        onSelect={(point) => {
          const slice = point?.datum.source[0];
          if (slice) onSelect?.(slice);
        }}
      />
      {children !== undefined ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
