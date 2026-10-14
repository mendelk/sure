import type { ReactNode } from "react";
import { IconButton } from "./icon-button";

/**
 * Floating bulk-actions bar rendered when rows are selected. Intrinsic width
 * (`w-fit`, centered) so it hugs its actions instead of stretching full-width.
 */
export function BulkActionsBar({
  countLabel,
  onClose,
  closeLabel,
  children,
}: {
  countLabel: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="shadow-border-lg fixed bottom-4 left-1/2 z-20 flex w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl bg-container p-3">
      <p className="text-sm text-primary">{countLabel}</p>
      <IconButton icon="x" label={closeLabel} onClick={onClose} />
      {children}
    </div>
  );
}
