// Balance sheet widget: classification groups with account-group weights and
// always-expanded prefs. Numbers arrive server-formatted; render verbatim.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Icon } from "../icon";
import type { HomeClassificationGroup } from "./home-api";

export type BalanceSheetData = {
  classification_groups: HomeClassificationGroup[];
  always_expanded: string[];
};

export type BalanceSheetText = {
  name: string;
  weight: string;
  value: string;
  expandAll: string;
  collapseAll: string;
};

const DEFAULT_TEXT: BalanceSheetText = {
  name: "Name",
  weight: "Weight",
  value: "Value",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
};

function numericWeight(weight: string): number {
  const parsed = Number(weight.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function GroupWeight({ weight, color }: { weight: string; color: string }) {
  const filled = Math.ceil(numericWeight(weight) / 20);
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex gap-[3px]" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={`h-2.5 w-0.5 rounded-lg ${index < filled ? "" : "opacity-20"}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <p className="privacy-sensitive text-sm whitespace-nowrap">{weight}</p>
    </div>
  );
}

export function BalanceSheetWidget({
  balanceSheet,
  emptyText,
  text = DEFAULT_TEXT,
}: {
  balanceSheet: BalanceSheetData;
  emptyText?: {
    assetTitle: string;
    assetDescription: string;
    liabilityTitle: string;
    liabilityDescription: string;
  };
  text?: BalanceSheetText;
}) {
  const allGroupKeys = balanceSheet.classification_groups.flatMap((group) =>
    group.account_groups.map((accountGroup) => accountGroup.key),
  );
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set(balanceSheet.always_expanded.filter((key) => allGroupKeys.includes(key))),
  );

  const expandable = allGroupKeys.length > 0;
  const allOpen = expandable && allGroupKeys.every((key) => openKeys.has(key));

  const toggleAll = () => {
    setOpenKeys(allOpen ? new Set() : new Set(allGroupKeys));
  };

  const toggleGroup = (key: string) => {
    setOpenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {expandable ? (
        <div className="flex justify-end px-4">
          <button
            type="button"
            onClick={toggleAll}
            aria-expanded={allOpen}
            className="rounded-md px-2 py-1 text-xs font-medium text-secondary transition-colors hover:bg-container-inset-hover hover:text-primary"
          >
            {allOpen ? text.collapseAll : text.expandAll}
          </button>
        </div>
      ) : null}
      {balanceSheet.classification_groups.map((group) => (
        <div key={group.key} className="space-y-4 px-4">
          <div className="flex items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-lg font-medium">
              <span className={group.syncing ? "animate-pulse" : ""}>{group.name}</span>
              {group.account_groups.length > 0 ? (
                <>
                  <span className="text-secondary">&middot;</span>
                  <span className="privacy-sensitive text-lg font-medium text-secondary">
                    {group.total.formatted}
                  </span>
                </>
              ) : null}
            </h2>
          </div>
          {group.account_groups.length > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex gap-1" aria-hidden="true">
                  {group.account_groups.map((accountGroup) => (
                    <div
                      key={accountGroup.key}
                      className="h-1.5 rounded-sm"
                      style={{
                        width: `${numericWeight(accountGroup.weight)}%`,
                        backgroundColor: accountGroup.color,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {group.account_groups.map((accountGroup) => (
                    <div key={accountGroup.key} className="flex items-center gap-2 text-sm">
                      <div
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: accountGroup.color }}
                      />
                      <p className="text-secondary">{accountGroup.name}</p>
                      <p className="privacy-sensitive font-mono text-primary">
                        {accountGroup.weight}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1 overflow-x-auto rounded-xl bg-container-inset p-1">
                <div className="flex items-center px-4 py-2 text-xs font-medium text-secondary uppercase">
                  <div className="w-40 shrink-0">{text.name}</div>
                  <div className="ml-auto flex items-center gap-2 text-right">
                    <div className="w-20 shrink-0">
                      <p>{text.weight}</p>
                    </div>
                    <div className="w-24 shrink-0">
                      <p>{text.value}</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-fit rounded-lg bg-container text-sm font-medium">
                  {group.account_groups.map((accountGroup, index) => {
                    const expanded = openKeys.has(accountGroup.key);
                    return (
                      <div key={accountGroup.key}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => {
                            toggleGroup(accountGroup.key);
                          }}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-4 text-left"
                        >
                          <span className="flex w-40 shrink-0 items-center gap-1">
                            <Icon
                              name="chevron-right"
                              size="sm"
                              className={expanded ? "rotate-90" : ""}
                            />
                            <span>{accountGroup.name}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2 text-right">
                            <span className="flex w-20 shrink-0 items-center justify-end gap-2">
                              <GroupWeight
                                weight={accountGroup.weight}
                                color={accountGroup.color}
                              />
                            </span>
                            <span className="privacy-sensitive w-24 shrink-0">
                              {accountGroup.total.formatted}
                            </span>
                          </span>
                        </button>
                        {expanded ? (
                          <div>
                            {accountGroup.accounts.map((account, accountIndex) => (
                              <div key={account.id}>
                                <div className="flex items-center justify-between gap-2 py-3 pr-4 pl-7 text-sm font-medium">
                                  <div className="flex items-center gap-2">
                                    {account.logo_url !== null && account.logo_url !== "" ? (
                                      <img
                                        src={account.logo_url}
                                        alt=""
                                        className="size-5 rounded-full"
                                        loading="lazy"
                                      />
                                    ) : null}
                                    <Link to={account.path} className="hover:underline">
                                      {account.name}
                                    </Link>
                                  </div>
                                  <div className="ml-auto flex items-center gap-2 text-right">
                                    <div className="flex w-20 shrink-0 items-center justify-end gap-2">
                                      <GroupWeight
                                        weight={account.weight}
                                        color={accountGroup.color}
                                      />
                                    </div>
                                    <div className="privacy-sensitive w-24 shrink-0">
                                      {account.balance.formatted}
                                    </div>
                                  </div>
                                </div>
                                {accountIndex < accountGroup.accounts.length - 1 ? (
                                  <hr className="mr-4 ml-21 border-primary" />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {index < group.account_groups.length - 1 ? (
                          <hr className="mx-4 border-primary" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-10">
              <p className="mt-4 mb-1 text-sm font-medium text-primary">
                {group.key === "asset" ? emptyText?.assetTitle : emptyText?.liabilityTitle}
              </p>
              <p className="text-center text-sm text-secondary">
                {group.key === "asset"
                  ? emptyText?.assetDescription
                  : emptyText?.liabilityDescription}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
