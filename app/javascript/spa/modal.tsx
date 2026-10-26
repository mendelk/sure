import { Dialog, DialogPanel } from "@headlessui/react";
import type { KeyboardEventHandler, ReactNode } from "react";

type ModalPlacement = "center" | "drawer";
type ModalLayer = "default" | "above";

export function Modal({
  ariaLabelledby,
  children,
  id,
  layer = "default",
  onClose,
  onKeyDown,
  open,
  panelClassName,
  placement = "center",
}: {
  ariaLabelledby?: string;
  children: ReactNode;
  id?: string;
  layer?: ModalLayer;
  onClose: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  open: boolean;
  panelClassName: string;
  placement?: ModalPlacement;
}) {
  const positionClassName =
    placement === "drawer"
      ? "items-end justify-end lg:p-3"
      : "items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]";

  return (
    <Dialog
      aria-labelledby={ariaLabelledby}
      className={layer === "above" ? "relative z-50" : "relative z-40"}
      onClose={onClose}
      onKeyDown={onKeyDown}
      open={open}
    >
      <div aria-hidden="true" className="fixed inset-0 bg-overlay" />
      <div className={`fixed inset-0 flex overflow-y-auto ${positionClassName}`}>
        <DialogPanel aria-labelledby={ariaLabelledby} className={panelClassName} id={id}>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
