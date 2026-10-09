import type { ReactNode } from "react";

export function SourcePreviewPanel({
  id,
  title,
  description,
  actions,
  tabs,
  sticky = true,
  children,
}: {
  id: string;
  title: string;
  description: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  sticky?: boolean;
  children: ReactNode;
}) {
  const hasTabs = tabs !== undefined && tabs !== null;
  return (
    <section
      className={`w-full min-w-0 flex-1 space-y-4 overflow-hidden rounded-xl border border-primary bg-container p-4 ${sticky ? "lg:sticky lg:top-20" : ""}`}
      aria-labelledby={id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={hasTabs ? "w-full space-y-1" : "space-y-1"}>
          <h2 id={id} className={hasTabs ? "sr-only" : "font-semibold text-primary"}>
            {title}
          </h2>
          {tabs}
          <p className="text-xs text-secondary">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
