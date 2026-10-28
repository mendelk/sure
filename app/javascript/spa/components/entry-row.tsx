import type { ReactNode } from "react";

export const entryRowGridClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-12";

export function EntryRow({
  id,
  children,
  category,
  tags,
  showTags,
  amount,
  positive,
  excluded = false,
  indent = false,
}: {
  id: string;
  children: ReactNode;
  category?: ReactNode;
  tags?: ReactNode;
  showTags: boolean;
  amount: string;
  positive: boolean;
  excluded?: boolean;
  indent?: boolean;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- The primary link remains the keyboard target; blank row space delegates to it, excluding interactive controls.
    <li
      className={`group ${entryRowGridClass} cursor-pointer px-4 py-3 transition-colors hover:bg-container-hover ${excluded ? "opacity-50" : ""}`}
      id={`entry_${id}`}
      onClick={(event) => {
        if (
          !(event.target instanceof Element) ||
          !event.currentTarget.contains(event.target) ||
          event.target.closest("a, button, input, select, textarea, label, [role=button]") !==
            null ||
          (window.getSelection()?.toString() ?? "") !== ""
        )
          return;
        event.currentTarget.querySelector<HTMLAnchorElement>("[data-entry-link]")?.click();
      }}
    >
      <div
        className={`flex min-w-0 items-center gap-3 ${showTags ? "md:col-span-5" : "md:col-span-7"} ${indent ? "pl-4" : ""}`}
      >
        {children}
      </div>
      <div className="hidden min-w-0 items-center gap-2 md:col-span-3 md:flex">{category}</div>
      {showTags ? <div className="hidden min-w-0 md:col-span-2 md:block">{tags}</div> : null}
      <p
        className={`privacy-sensitive whitespace-nowrap text-right text-sm font-medium tabular-nums md:col-span-2 ${positive ? "text-success" : "text-primary"}`}
      >
        {amount}
      </p>
    </li>
  );
}
