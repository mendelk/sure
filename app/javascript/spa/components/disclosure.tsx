import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { useId, useRef, type DragEvent, type DragEventHandler, type ReactNode } from "react";
import { Icon } from "../icon";

export function DisclosureSection({
  title,
  children,
  id,
  defaultOpen = false,
  className,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: ReactNode;
  children: ReactNode;
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
          className={`rounded-xl border bg-container p-4 ${className ?? "border-primary"}`}
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
          <DisclosureButton
            id={buttonId}
            ref={button}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm text-left font-semibold text-primary focus-ring"
          >
            <span className="min-w-0 flex-1">{title}</span>
            <Icon
              name="chevron-right"
              size="sm"
              className={`motion-safe:transition-transform motion-safe:duration-150 ${open ? "rotate-90" : ""}`}
            />
          </DisclosureButton>
          <DisclosurePanel unmount={false} className="mt-3 space-y-3">
            {children}
          </DisclosurePanel>
        </section>
      )}
    </Disclosure>
  );
}
