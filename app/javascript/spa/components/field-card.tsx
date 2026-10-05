import type { CSSProperties, DragEventHandler, ReactNode } from "react";
import { IconButton } from "./icon-button";

export function FieldCard({
  label,
  drag,
  removeLabel,
  className = "border-primary",
  children,
  style,
  onDragOver,
  onDrop,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  drag?: {
    label: string;
    helpId: string;
    onStart: DragEventHandler<HTMLDivElement>;
    onEnd: DragEventHandler<HTMLDivElement>;
    onMove: (offset: number) => void;
  };
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  onRemove: () => void;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native drag targets supplement keyboard-accessible reorder and remove controls.
    <article
      className={`space-y-3 rounded-lg border bg-surface p-3 motion-safe:transition-transform motion-safe:duration-150 ${className}`}
      style={style}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1">
        <div
          draggable={drag !== undefined}
          className={`flex min-w-0 flex-1 items-center gap-1 ${drag ? "cursor-grab select-none active:cursor-grabbing" : ""}`}
          onDragStart={drag?.onStart}
          onDragEnd={drag?.onEnd}
        >
          {drag ? (
            <IconButton
              draggable
              icon="grip-horizontal"
              label={drag.label}
              aria-describedby={drag.helpId}
              className="cursor-grab active:cursor-grabbing"
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                drag.onMove(event.key === "ArrowUp" ? -1 : 1);
              }}
            />
          ) : null}
          <h3 className="min-w-0 flex-1 font-medium text-primary">{label}</h3>
        </div>
        <IconButton icon="x" label={removeLabel} onClick={onRemove} />
      </div>
      {children}
    </article>
  );
}
