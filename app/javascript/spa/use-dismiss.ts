import { useEventListener } from "usehooks-ts";
import type { RefObject } from "react";

/**
 * Dismiss-on-outside-click + Escape for popovers and dropdown menus.
 * Replaces the hand-rolled document.addEventListener pairs; the hook
 * keeps the handler ref fresh so callbacks never capture stale state.
 */
export function useDismiss<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onDismiss: () => void,
  active = true,
): void {
  useEventListener("pointerdown", (event) => {
    if (ref.current === null || !(event.target instanceof Node)) return;
    if (!ref.current.contains(event.target)) onDismiss();
  });

  useEventListener("keydown", (event) => {
    if (active && event.key === "Escape") onDismiss();
  });
}
