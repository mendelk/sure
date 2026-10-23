/* eslint-disable import/max-dependencies -- Home shell composes all eight dashboard widgets, search, layout state, and section chrome. */
import { useMemo, useState } from "react";
import { Link, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./icon";
import { HOME_PERIOD_OPTIONS, currentMonthStart, type HomeSearch } from "./home/home-search";
import { NoAccountsPlaceholder, resolveNoAccountsText } from "./home/no-accounts-placeholder";
import { BalanceSheetWidget } from "./home/balance-sheet-widget";
import { NetWorthWidget } from "./home/net-worth-widget";
import { CashflowSankeyWidget } from "./home/cashflow-sankey-widget";
import { MoneyFlowWidget, resolveMoneyFlowText } from "./home/money-flow-widget";
import { SpendingTrendWidget, resolveSpendingTrendText } from "./home/spending-trend-widget";
import { CashForecastWidget, resolveCashForecastText } from "./home/cash-forecast-widget";
import { OutflowsDonutWidget } from "./home/outflows-donut-widget";
import {
  InsightsFeedWidget,
  resolveInsightsText,
  type HomeInsight,
} from "./home/insights-feed-widget";
import {
  InvestmentSummaryWidget,
  resolveInvestmentText,
  toInvestmentSummaryData,
} from "./home/investment-summary-widget";
import {
  HomeApiError,
  homeWidgetsQueryOptions,
  type HomeBalanceSheet,
  type HomeCashForecast,
  type HomeInsight as ApiInsight,
  type HomeInvestmentSummary,
  type HomeNetWorth,
  type HomeSankey,
} from "./home/home-api";
import { initialLayoutState, useHomeLayout, type HomeSectionInfo } from "./home/home-preferences";
import { HomeSection } from "./home/home-section";

const SECTION_TITLES: Record<string, string> = {
  insights_feed: "Insights",
  cashflow_sankey: "Cashflow",
  cash_forecast: "Cash Forecast",
  money_flow: "Money In / Out",
  spending_trend: "Spending",
  outflows_donut: "Outflows",
  investment_summary: "Investments",
  net_worth_chart: "Net Worth",
  balance_sheet: "Balance Sheet",
};

type WidgetPayload = {
  balance_sheet: HomeBalanceSheet;
  net_worth: HomeNetWorth;
  cashflow_sankey: HomeSankey;
  cash_forecast: HomeCashForecast | null;
  investment_summary: HomeInvestmentSummary;
  insights: { enabled: boolean; insights: ApiInsight[] };
  money_flow_accounts?: { id: string; name: string }[];
};

function sectionMetas(payload: WidgetPayload | undefined): HomeSectionInfo[] {
  if (payload === undefined) return [];
  const metas: HomeSectionInfo[] = [];
  if (payload.insights.enabled && payload.insights.insights.length > 0) {
    metas.push({
      key: "insights_feed",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "full",
        grow: false,
        minHeight: 0,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    });
  }
  metas.push(
    {
      key: "cashflow_sankey",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "full",
        grow: false,
        minHeight: 384,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
    {
      key: "cash_forecast",
      visible: payload.cash_forecast !== null,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: true,
        minHeight: 208,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
    {
      key: "money_flow",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: false,
        minHeight: 0,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
    {
      key: "spending_trend",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: true,
        minHeight: 208,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
    {
      key: "outflows_donut",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: false,
        minHeight: 0,
        widthToggle: false,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
  );
  if (payload.investment_summary.present) {
    metas.push({
      key: "investment_summary",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: false,
        minHeight: 0,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    });
  }
  metas.push(
    {
      key: "net_worth_chart",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: true,
        minHeight: 208,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
    {
      key: "balance_sheet",
      visible: true,
      collapsible: true,
      collapsed: false,
      layout: {
        colSpan: "single",
        grow: false,
        minHeight: 0,
        widthToggle: true,
        heightPreset: "auto",
        heightPx: 288,
      },
    },
  );
  return metas;
}

function HomeWidgetBody({
  sectionKey,
  payload,
  search,
  homePath,
}: {
  sectionKey: string;
  payload: WidgetPayload;
  search: HomeSearch;
  homePath: string;
}) {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate({ from: "/" });
  const homeText = bootstrap.homeText;
  switch (sectionKey) {
    case "insights_feed": {
      const text = resolveInsightsText(homeText);
      const insights: HomeInsight[] = payload.insights.insights.map((insight) => ({
        id: insight.id,
        type: insight.type,
        title: insight.title,
        body: insight.body,
        priority: insight.priority,
        status: insight.status,
        generated_at: insight.generated_at,
        icon_key: insight.icon_key,
        icon_css_color: insight.icon_css_color,
        sentiment: insight.sentiment,
        key_figure:
          insight.key_figure === null
            ? null
            : { value: insight.key_figure.value, caption: insight.key_figure.caption },
        acknowledge_path: insight.acknowledge_path,
      }));
      return (
        <InsightsFeedWidget
          insights={insights}
          viewAllHref="/insights"
          homePath={homePath}
          text={text}
        />
      );
    }
    case "investment_summary":
      return (
        <InvestmentSummaryWidget
          summary={toInvestmentSummaryData(payload.investment_summary)}
          text={resolveInvestmentText(homeText)}
        />
      );
    case "cash_forecast":
      return (
        <CashForecastWidget
          forecast={payload.cash_forecast}
          text={resolveCashForecastText(homeText)}
        />
      );
    case "cashflow_sankey":
      return <CashflowSankeyWidget sankey={payload.cashflow_sankey} />;
    case "money_flow": {
      const month = search.money_flow_month ?? currentMonthStart();
      return (
        <MoneyFlowWidget
          month={month}
          accountIds={search.money_flow_account_ids}
          homePath={homePath}
          text={resolveMoneyFlowText(homeText)}
          onMonthChange={(iso) => {
            void navigate({ search: { ...search, money_flow_month: iso } });
          }}
          onAccountIdsChange={(ids) => {
            void navigate({ search: { ...search, money_flow_account_ids: ids } });
          }}
        />
      );
    }
    case "spending_trend": {
      const month = search.spending_month ?? currentMonthStart();
      return (
        <SpendingTrendWidget
          month={month}
          homePath={homePath}
          text={resolveSpendingTrendText(homeText)}
          onMonthChange={(iso) => {
            void navigate({ search: { ...search, spending_month: iso } });
          }}
        />
      );
    }
    case "outflows_donut":
      return <OutflowsDonutWidget homePath={homePath} />;
    case "net_worth_chart":
      return <NetWorthWidget netWorth={payload.net_worth} title={SECTION_TITLES.net_worth_chart} />;
    case "balance_sheet":
      return <BalanceSheetWidget balanceSheet={payload.balance_sheet} />;
    default:
      return null;
  }
}

function PeriodPicker({ search }: { search: HomeSearch }) {
  const navigate = useNavigate({ from: "/" });
  const selected = search.period ?? (search.start_date !== undefined ? "custom" : "last_30_days");
  return (
    <label className="inline-flex items-center gap-2 text-sm font-medium">
      <span className="sr-only">Time period</span>
      <select
        aria-label="Time period"
        className="rounded-lg border border-primary bg-container px-3 py-1.5 text-sm font-medium"
        onChange={(event) => {
          const period = event.target.value;
          if (period !== "custom") {
            void navigate({
              search: { ...search, period, start_date: undefined, end_date: undefined },
            });
          }
        }}
        value={HOME_PERIOD_OPTIONS.some((option) => option.key === selected) ? selected : "custom"}
      >
        {HOME_PERIOD_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
    </label>
  );
}

export function HomePage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const search = useSearch({ from: "/" });
  const homePath = bootstrap.apiPaths.home;
  const widgets = useQuery({
    ...homeWidgetsQueryOptions(homePath),
    retry: (failureCount, error) =>
      !(error instanceof HomeApiError && error.status < 500) && failureCount < 2,
  });
  const payload = widgets.data;
  const sections = useMemo(() => sectionMetas(payload), [payload]);
  const fallbackOrder = useMemo(() => initialLayoutState(sections).order, [sections]);
  const { layout, move, reorder, toggle, setHeight } = useHomeLayout(sections);
  const [grabbedKey, setGrabbedKey] = useState<string | null>(null);
  const visibleByKey: Record<string, HomeSectionInfo> = {};
  for (const section of sections) if (section.visible) visibleByKey[section.key] = section;
  const effectiveOrder = layout.order.length > 0 ? layout.order : fallbackOrder;
  const orderedKeys = effectiveOrder.filter((key) => Object.hasOwn(visibleByKey, key));

  const onDropOnto = (targetKey: string) => (event: React.DragEvent) => {
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/home-section");
    if (sourceKey.length === 0 || sourceKey === targetKey) return;
    const next = orderedKeys.filter((key) => key !== sourceKey);
    next.splice(next.indexOf(targetKey), 0, sourceKey);
    reorder(next);
  };

  const firstName = bootstrap.currentUser.name.split(" ").at(0) ?? "";

  return (
    <div>
      <div className="space-y-1 mb-6 flex gap-4 justify-between items-center lg:items-start">
        <div className="space-y-1">
          <h1 className="text-xl lg:text-3xl font-medium text-primary">
            {firstName.length > 0 ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-sm lg:text-base text-secondary">
            Here&apos;s what&apos;s happening with your finances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
            to="/accounts/new"
          >
            <Icon name="plus" size="sm" />
            New
          </Link>
          <Link
            aria-label="New account"
            className="rounded-full lg:hidden inline-flex items-center justify-center size-9"
            to="/accounts/new"
          >
            <Icon name="plus" size="sm" />
          </Link>
        </div>
      </div>
      <div className="flex items-center justify-end mb-4">
        <PeriodPicker search={search} />
      </div>
      <div className="sr-only" aria-live="polite">
        {widgets.isLoading ? "Loading dashboard" : null}
      </div>
      {widgets.isError ? (
        <p role="alert" className="text-sm text-secondary">
          Dashboard could not be loaded. Please try again.
        </p>
      ) : widgets.isLoading || payload === undefined ? (
        <output className="text-sm text-secondary">Loading dashboard…</output>
      ) : orderedKeys.length === 0 ? (
        <NoAccountsPlaceholder
          newAccountHref="/accounts/new"
          text={resolveNoAccountsText(bootstrap.homeText)}
        />
      ) : (
        <ul
          aria-label="Dashboard sections"
          className="grid list-none grid-cols-1 gap-6 p-0 pb-6 lg:pb-12"
        >
          {orderedKeys.map((key) => {
            if (!Object.hasOwn(visibleByKey, key)) return null;
            const section = visibleByKey[key];
            const collapsed = layout.collapsed[key] ?? false;
            const height = layout.heights[key] ?? section.layout.heightPreset;
            return (
              <HomeSection
                collapsed={collapsed}
                grabbed={grabbedKey === key}
                key={key}
                layout={{ ...section.layout, heightPreset: height }}
                onDragEnd={() => {
                  setGrabbedKey(null);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/home-section", key);
                  event.dataTransfer.effectAllowed = "move";
                  setGrabbedKey(key);
                }}
                onDrop={onDropOnto(key)}
                onGrabToggle={() => {
                  setGrabbedKey((current) => (current === key ? null : key));
                }}
                onHeightChange={(preset) => {
                  setHeight(key, preset);
                }}
                onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (grabbedKey !== key) {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setGrabbedKey(key);
                    }
                    return;
                  }
                  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    move(key, -1);
                  } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    move(key, 1);
                  } else if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
                    event.preventDefault();
                    setGrabbedKey(null);
                  }
                }}
                onMove={(direction) => {
                  move(key, direction);
                }}
                onToggle={() => {
                  toggle(key);
                }}
                sectionKey={key}
                title={SECTION_TITLES[key] ?? key}
              >
                <HomeWidgetBody
                  homePath={homePath}
                  payload={payload}
                  search={search}
                  sectionKey={key}
                />
              </HomeSection>
            );
          })}
        </ul>
      )}
    </div>
  );
}
