import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../icon";
import type { HomeHeightPreset, HomeSectionLayout } from "./home-preferences";

type HomeSectionProps = {
  sectionKey: string;
  title: string;
  collapsed: boolean;
  grabbed: boolean;
  layout: HomeSectionLayout;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  onGrabToggle: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: React.DragEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onHeightChange: (preset: HomeHeightPreset) => void;
  children: ReactNode;
};

function sectionStyle(layout: HomeSectionLayout): { minHeight?: number } | undefined {
  if (layout.grow) return { minHeight: Math.max(layout.minHeight, layout.heightPx) };
  if (layout.minHeight > 0) return { minHeight: layout.minHeight };
  return undefined;
}

function subscribePointerDown(handler: (event: PointerEvent) => void): () => void {
  document.addEventListener("pointerdown", handler);
  return () => {
    document.removeEventListener("pointerdown", handler);
  };
}
export function HomeSection({
  sectionKey,
  title,
  collapsed,
  grabbed,
  layout,
  onToggle,
  onMove,
  onGrabToggle,
  onDragStart,
  onDragEnd,
  onDrop,
  onKeyDown,
  onHeightChange,
  children,
}: HomeSectionProps) {
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () =>
      sizeOpen
        ? subscribePointerDown((event) => {
            if (
              event.target instanceof Node &&
              sizeRef.current !== null &&
              !sizeRef.current.contains(event.target)
            )
              setSizeOpen(false);
          })
        : undefined,
    [sizeOpen],
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Sortable section: ERB uses section[draggable] with the same keyboard reorder pattern.
    <li
      aria-label={`${title} section. Press Enter or Space to grab for reordering, then use arrow keys to move.`}
      className="bg-container group rounded-xl shadow-border-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      data-grabbed={grabbed ? "true" : undefined}
      data-section-key={sectionKey}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      style={sectionStyle(layout)}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Sortable section: ERB uses section[tabindex=0] with the same keyboard reorder pattern.
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            aria-expanded={!collapsed}
            aria-label="Toggle section visibility"
            className="flex size-6 items-center justify-center rounded-md text-secondary transition-colors hover:bg-container-inset-hover hover:text-primary"
            onClick={onToggle}
            type="button"
          >
            <Icon
              name="chevron-down"
              size="sm"
              className={collapsed ? "transition-transform -rotate-90" : "transition-transform"}
            />
          </button>
          <h2 className="text-base font-medium">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {layout.grow && (
            <div className="relative hidden lg:block" ref={sizeRef}>
              <button
                aria-expanded={sizeOpen}
                aria-label="Adjust size"
                className="focus-ring flex size-6 items-center justify-center rounded-md text-secondary transition-colors hover:bg-container-inset-hover hover:text-primary lg:opacity-0 lg:group-hover:opacity-100"
                onClick={() => {
                  setSizeOpen((open) => !open);
                }}
                type="button"
              >
                <Icon name="sliders-horizontal" size="sm" className="size-3.5!" />
              </button>
              {sizeOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-10 w-48 p-2.5 space-y-2.5 bg-surface rounded-xl shadow-border-xs border border-primary">
                  <fieldset className="space-y-1.5">
                    <legend className="px-0 text-xs font-medium text-secondary">Height</legend>
                    <div className="flex gap-1">
                      {(["compact", "auto", "tall"] as const).map((preset) => (
                        <button
                          aria-pressed={layout.heightPreset === preset}
                          className={
                            layout.heightPreset === preset
                              ? "flex-1 rounded-md bg-container-inset px-2 py-1 text-xs font-medium capitalize text-primary"
                              : "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize text-secondary hover:bg-container-inset-hover"
                          }
                          key={preset}
                          onClick={() => {
                            onHeightChange(preset);
                            setSizeOpen(false);
                          }}
                          type="button"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}
            </div>
          )}
          <button
            aria-label="Drag to reorder section"
            className="hidden h-6 w-6 cursor-grab items-center justify-center text-secondary transition-colors hover:text-primary active:cursor-grabbing lg:flex lg:opacity-0 lg:group-hover:opacity-100"
            onClick={onGrabToggle}
            type="button"
          >
            <Icon name="grip-vertical" size="sm" />
          </button>
          <div className="flex items-center gap-1 lg:hidden">
            <button
              aria-label="Move section up"
              className="flex items-center justify-center w-6 h-6 rounded-md text-secondary hover:text-primary"
              onClick={() => {
                onMove(-1);
              }}
            >
              <Icon name="chevron-up" size="sm" />
            </button>
            <button
              aria-label="Move section down"
              className="flex items-center justify-center w-6 h-6 rounded-md text-secondary hover:text-primary"
              onClick={() => {
                onMove(1);
              }}
            >
              <Icon name="chevron-down" size="sm" />
            </button>
          </div>
        </div>
      </div>
      {!collapsed && <div className="py-4">{children}</div>}
    </li>
  );
}
