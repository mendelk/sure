import { useId, type ReactNode } from "react";
import { CategoryIcon } from "../icon";

const VARIANT_CLASSES = {
  info: "bg-info/10 border-info/20 text-info",
  success: "bg-success/10 border-success/20 text-success",
  warning: "bg-warning/10 border-warning/20 text-warning",
  error: "bg-destructive/10 border-destructive-subtle text-destructive",
  destructive: "bg-destructive/10 border-destructive-subtle text-destructive",
} as const;
const VARIANT_ICONS = {
  info: "info",
  success: "circle-check",
  warning: "triangle-alert",
  error: "circle-x",
  destructive: "circle-x",
} as const;

export function Alert({
  children,
  className,
  live = "none",
  title,
  variant = "info",
}: {
  children: ReactNode;
  className?: string;
  live?: "none" | "status" | "alert";
  title?: string;
  variant?: keyof typeof VARIANT_CLASSES;
}) {
  const titleId = useId();
  return (
    <div
      aria-labelledby={title !== undefined && title !== "" ? titleId : undefined}
      className={`flex items-start gap-3 rounded-lg border p-4 ${VARIANT_CLASSES[variant]} ${className ?? ""}`}
      role={live === "none" ? undefined : live}
    >
      <CategoryIcon name={VARIANT_ICONS[variant]} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-sm text-primary">
        {title !== undefined && title !== "" ? (
          <p className="font-medium" id={titleId}>
            {title}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
