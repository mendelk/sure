import { useCallback, useMemo, useRef, useState } from "react";
import { createChartCursor, cursorHost } from "@tanstack/charts/cursor";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { zoomX, type ZoomXChange, type ZoomXWindow } from "@tanstack/charts/interaction/zoom";

type TimeSeriesInteractionOptions = {
  enabled?: boolean;
  pointCount: number;
  start: number;
  end: number;
  viewport: ZoomXWindow<number>;
  onViewportChange: (viewport: ZoomXWindow<number>) => void;
  title: string;
  formatter: Intl.DateTimeFormat;
};

// The caller owns the viewport. Gestures only update that local window: neither
// previews, commits, nor cancellation navigate or refetch financial data.
export function useTimeSeriesInteraction({
  enabled = true,
  pointCount,
  start,
  end,
  viewport,
  onViewportChange,
  title,
  formatter,
}: TimeSeriesInteractionOptions) {
  const [isCoarsePointer] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [cursor] = useState(() => createChartCursor<number, number>());
  const hostRef = useRef<HTMLDivElement>(null);
  const focusZoomSurface = useCallback(() => {
    const active = document.activeElement;
    // Hover must not steal focus from a user editing account/search fields.
    if (
      active instanceof HTMLElement &&
      active.closest("input, textarea, select, [contenteditable='true']")
    )
      return;
    const surface = hostRef.current?.querySelector<SVGElement>("[data-chart-zoom-surface]");
    if (surface !== active) surface?.focus({ preventScroll: true });
  }, []);
  const interaction = useMemo(
    () => ({
      focus: "group-x" as const,
      cursor: {
        use: cursorHost,
        controller: cursor,
        mode: "focus" as const,
        match: "x" as const,
        pin: false,
      },
      maxFocusDistance: Number.POSITIVE_INFINITY,
      controls:
        enabled && !isCoarsePointer && pointCount > 1 && end > start
          ? [
              zoomX({
                window: controlledSignal<ZoomXWindow<number>, ZoomXChange<number>>(
                  viewport,
                  (next, { reason }) => {
                    if (reason.type === "cancel") {
                      onViewportChange({ start: reason.origin.start, end: reason.origin.end });
                      return;
                    }
                    if (next.start === next.end) return;
                    onViewportChange({ start: next.start, end: next.end });
                  },
                ),
                extent: [start, end],
                ariaLabel: title,
                format: (value) => formatter.format(value),
              }),
            ]
          : [],
    }),
    [
      enabled,
      isCoarsePointer,
      pointCount,
      start,
      end,
      viewport,
      onViewportChange,
      title,
      formatter,
      cursor,
    ],
  );
  return {
    interaction,
    hostProps: {
      ref: hostRef,
      onPointerEnter: focusZoomSurface,
      onFocusCapture: focusZoomSurface,
    },
  };
}
