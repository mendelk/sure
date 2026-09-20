import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { useDismiss } from "./use-dismiss";
import type { Dashboard } from "./dashboard-storage";

export function DashboardSwitcher({
  activeDashboardId,
  dashboards,
  onSelect,
}: {
  activeDashboardId: string;
  dashboards: Dashboard[];
  onSelect: (dashboardId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useDismiss(
    containerRef,
    () => {
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    isOpen,
  );

  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);

  const activeDashboard = dashboards.find((dashboard) => dashboard.id === activeDashboardId);
  const lowerQuery = query.trim().toLowerCase();
  const filtered = dashboards.filter((dashboard) =>
    dashboard.name.toLowerCase().includes(lowerQuery),
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label="Dashboard"
        className="flex max-w-md cursor-pointer items-center gap-1 rounded-lg bg-transparent py-1 text-left focus-ring"
        id="dashboard-switcher"
        onClick={() => {
          setIsOpen((value) => !value);
          setQuery("");
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="truncate text-2xl font-semibold tracking-tight text-primary">
          {activeDashboard === undefined ? "Dashboards" : activeDashboard.name}
        </span>
        <Icon className="shrink-0" name="chevron-down" size="sm" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-56 rounded-lg bg-container p-1.5 shadow-lg shadow-border-xs">
          <div className="relative mb-1">
            <input
              aria-label="Search dashboards"
              autoComplete="off"
              className="h-10 w-full rounded-lg border-none bg-container pl-10 pr-3 text-base text-primary placeholder:text-secondary focus:outline-hidden focus:ring-0 sm:text-sm"
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              placeholder="Search dashboards"
              ref={searchInputRef}
              type="search"
              value={query}
            />
            <Icon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary"
              name="search"
            />
          </div>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {filtered.map((dashboard) => {
              const isSelected = dashboard.id === activeDashboardId;
              return (
                <button
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-container-inset-hover ${
                    isSelected ? "bg-container-inset" : ""
                  }`}
                  data-selected={isSelected}
                  key={dashboard.id}
                  onClick={() => {
                    onSelect(dashboard.id);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center ${
                      isSelected ? "" : "invisible"
                    }`}
                  >
                    <Icon className="size-4 text-primary" name="check" />
                  </span>
                  <span className="truncate text-sm text-primary">{dashboard.name}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-secondary">No matching dashboards.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
