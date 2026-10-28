import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { useId, useRef, type DragEvent, type DragEventHandler, type ReactNode } from "react";
import { Icon } from "../icon";

export function DisclosureSection({
  title,
  children,
  leading,
  footer,
  variant = "card",
  id,
  defaultOpen = false,
  className,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: ReactNode;
  children: ReactNode;
  leading?: ReactNode;
  footer?: ReactNode;
  variant?: "card" | "inset";
  id?: string;
  defaultOpen?: boolean;
  className?: string;
  /** Return true to expand a closed section for a compatible drag. */
  onDragOver?: (event: DragEvent<HTMLElement>) => boolean;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const button = useRef<HTMLButtonElement>(null);

  return (
    <Disclosure defaultOpen={defaultOpen}>
      {({ open }) => (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Drag targets supplement the panel's keyboard-accessible field controls.
        <section
          aria-labelledby={buttonId}
          className={`${variant === "inset" ? "rounded-xl bg-container-inset p-1" : "rounded-xl border bg-container p-4"} ${className ?? (variant === "card" ? "border-primary" : "")}`}
          onDragOver={
            onDragOver === undefined
              ? undefined
              : (event) => {
                  const expand = onDragOver(event);
                  if (expand && !open) button.current?.click();
                }
          }
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div
            className={
              variant === "inset" ? "flex items-center gap-4 px-4 py-2" : "flex items-center gap-3"
            }
          >
            {leading}
            <DisclosureButton
              id={buttonId}
              ref={button}
              className={`focus-ring flex min-w-0 w-full cursor-pointer items-center justify-between gap-3 rounded-sm text-left ${variant === "inset" ? "text-xs font-medium text-secondary" : "font-semibold text-primary"}`}
            >
              <span className="min-w-0 flex-1">{title}</span>
              <Icon
                name={variant === "inset" ? "chevron-down" : "chevron-right"}
                size="sm"
                className={`motion-safe:transition-transform motion-safe:duration-150 ${open ? (variant === "inset" ? "rotate-180" : "rotate-90") : ""}`}
              />
            </DisclosureButton>
          </div>
          <DisclosurePanel
            unmount={false}
            className={variant === "inset" ? "space-y-3 p-4" : "mt-3 space-y-3"}
          >
            {children}
          </DisclosurePanel>
          {footer}
        </section>
      )}
    </Disclosure>
  );
}
