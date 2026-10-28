import { Fragment, type ReactNode } from "react";
import type { AccountActivity } from "../api/accounts";
import { CategoryIcon } from "../icon";
import { DisclosureSection } from "./disclosure";

export function AccountActivityGroup({
  group,
  selection,
  children,
  text,
}: {
  group: AccountActivity["groups"][number];
  selection?: ReactNode;
  children: ReactNode;
  text: Record<string, string>;
}) {
  return (
    <DisclosureSection
      variant="inset"
      leading={selection}
      title={
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="uppercase">
            {group.label} <span className="mx-1">&middot;</span> {group.entries.length}
          </span>
          <span className="flex items-center gap-2" title={text.balance_tooltip}>
            <span className="privacy-sensitive tabular-nums">{group.balance}</span>
            <CategoryIcon name="info" className="size-3" />
          </span>
        </span>
      }
      footer={
        <ul className="divide-y divide-tertiary rounded-lg bg-container shadow-border-xs">
          {children}
        </ul>
      }
    >
      {group.reconciliation.length === 0 ? (
        <p className="text-sm text-secondary">{text.no_balance_data}</p>
      ) : (
        <dl className="space-y-3 text-sm text-primary">
          {group.reconciliation.map((item) => (
            <Fragment key={item.label}>
              {item.style === "subtotal" ? <hr className="border-primary" /> : null}
              <div className="flex items-center gap-4">
                <dt className="flex items-center gap-2" title={item.tooltip}>
                  {item.label}
                  <CategoryIcon name="info" className="size-3 shrink-0 text-secondary" />
                </dt>
                <span
                  aria-hidden="true"
                  className={`grow border-t border-dashed ${item.style === "final" ? "border-primary" : "border-secondary"}`}
                />
                <dd
                  className={`privacy-sensitive shrink-0 tabular-nums ${item.style === "start" || item.style === "final" ? "font-bold" : item.style === "subtotal" ? "font-medium" : ""}`}
                >
                  {item.value}
                </dd>
              </div>
              {item.style === "adjustment" ? <hr className="border-primary" /> : null}
            </Fragment>
          ))}
        </dl>
      )}
    </DisclosureSection>
  );
}
