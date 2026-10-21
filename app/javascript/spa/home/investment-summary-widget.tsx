import { Icon } from "../icon";
import type { HomeMoney } from "./home-api";

export type HomePeriod = {
  label?: string;
};

export type HomeInvestmentHolding = {
  ticker: string;
  name?: string | null;
  logoUrl?: string | null;
  /** Server-formatted weight string ("49.0%") or legacy fraction; rendered verbatim when a string */
  weight?: number | string | null;
  value: HomeMoney;
  /** Server-formatted percent, e.g. "+4.2%"; null when unavailable */
  returnPercent?: string | null;
  returnColor?: string | null;
  color?: string | null;
};

export type HomeInvestmentActivity = {
  /** Server-formatted heading, e.g. the period label */
  label: string;
  contributions: HomeMoney;
  withdrawals: HomeMoney;
  tradesCount: number;
};

export type InvestmentSummaryData = {
  present: boolean;
  portfolioValue?: HomeMoney;
  totalReturn?: {
    value: HomeMoney;
    percentFormatted: string;
    color: string;
  } | null;
  holdings?: HomeInvestmentHolding[];
  activity?: HomeInvestmentActivity | null;
};

/** Maps the HomeApi snake_case payload into widget camelCase props. */
export function toInvestmentSummaryData(raw: {
  present: boolean;
  portfolio_value?: HomeMoney;
  total_return?: {
    value: HomeMoney;
    percent_formatted: string;
    color: string;
  } | null;
  holdings?: {
    ticker: string;
    name: string | null;
    logo_url: string | null;
    weight: number | string | null;
    value: HomeMoney;
    return_percent: string | null;
    return_color?: string | null;
    color?: string | null;
  }[];
  activity?: {
    label: string;
    contributions: HomeMoney;
    withdrawals: HomeMoney;
    trades_count: number;
  } | null;
}): InvestmentSummaryData {
  return {
    present: raw.present,
    ...(raw.portfolio_value === undefined ? {} : { portfolioValue: raw.portfolio_value }),
    ...(raw.total_return === undefined
      ? {}
      : raw.total_return === null
        ? { totalReturn: null }
        : {
            totalReturn: {
              value: raw.total_return.value,
              percentFormatted: raw.total_return.percent_formatted,
              color: raw.total_return.color,
            },
          }),
    ...(raw.holdings === undefined
      ? {}
      : {
          holdings: raw.holdings.map((holding) => ({
            ticker: holding.ticker,
            name: holding.name,
            logoUrl: holding.logo_url,
            weight: holding.weight,
            value: holding.value,
            returnPercent: holding.return_percent,
            returnColor: holding.return_color ?? holding.color ?? null,
          })),
        }),
    ...(raw.activity === undefined
      ? {}
      : {
          activity:
            raw.activity === null
              ? null
              : {
                  label: raw.activity.label,
                  contributions: raw.activity.contributions,
                  withdrawals: raw.activity.withdrawals,
                  tradesCount: raw.activity.trades_count,
                },
        }),
  };
}

const DEFAULT_TEXT = {
  title: "Investments",
  totalReturn: "Total Return",
  holding: "Holding",
  weight: "Weight",
  value: "Value",
  return: "Return",
  contributions: "Contributions",
  withdrawals: "Withdrawals",
  trades: "Trades",
} as const;

export type InvestmentSummaryText = {
  title: string;
  totalReturn: string;
  holding: string;
  weight: string;
  value: string;
  return: string;
  contributions: string;
  withdrawals: string;
  trades: string;
};
export function resolveInvestmentText(homeText: Record<string, string | undefined>) {
  return {
    title: homeText.investment_title ?? DEFAULT_TEXT.title,
    totalReturn: homeText.investment_total_return ?? DEFAULT_TEXT.totalReturn,
    holding: homeText.investment_holding ?? DEFAULT_TEXT.holding,
    weight: homeText.investment_weight ?? DEFAULT_TEXT.weight,
    value: homeText.investment_value ?? DEFAULT_TEXT.value,
    return: homeText.investment_return ?? DEFAULT_TEXT.return,
    contributions: homeText.investment_contributions ?? DEFAULT_TEXT.contributions,
    withdrawals: homeText.investment_withdrawals ?? DEFAULT_TEXT.withdrawals,
    trades: homeText.investment_trades ?? DEFAULT_TEXT.trades,
  };
}

export function InvestmentSummaryWidget({
  summary,
  text = DEFAULT_TEXT,
}: {
  summary?: InvestmentSummaryData | null;
  text?: InvestmentSummaryText;
}) {
  if (!summary || !summary.present || summary.portfolioValue === undefined) return null;

  const showActivity =
    summary.activity !== null &&
    summary.activity !== undefined &&
    (summary.activity.tradesCount > 0 ||
      summary.activity.contributions.amount !== "0" ||
      summary.activity.withdrawals.amount !== "0");

  return (
    <div id="investment-summary" className="space-y-4">
      <div className="flex justify-between gap-4 px-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">{text.title}</h2>
          </div>

          <p className="text-primary text-3xl font-medium privacy-sensitive">
            {summary.portfolioValue.formatted}
          </p>

          {summary.totalReturn ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-secondary">{text.totalReturn}:</span>
              <span
                className="font-medium privacy-sensitive"
                style={{ color: summary.totalReturn.color }}
              >
                {summary.totalReturn.value.formatted} ({summary.totalReturn.percentFormatted})
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {(summary.holdings ?? []).length > 0 ? (
        <div className="bg-container-inset rounded-xl p-1 mx-4 overflow-x-auto">
          <div className="rounded-lg shadow-border-xs bg-container overflow-hidden">
            <table className="w-full">
              <thead className="bg-container-inset">
                <tr className="uppercase text-xs font-medium text-secondary">
                  <th className="px-4 py-2 text-left font-medium">{text.holding}</th>
                  <th className="px-4 py-2 text-right font-medium">{text.weight}</th>
                  <th className="px-4 py-2 text-right font-medium">{text.value}</th>
                  <th className="px-4 py-2 text-right font-medium">{text.return}</th>
                </tr>
              </thead>
              <tbody className="font-medium text-sm divide-y divide-subdued">
                {(summary.holdings ?? []).map((holding) => (
                  <tr key={holding.ticker}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {holding.logoUrl !== null &&
                        holding.logoUrl !== undefined &&
                        holding.logoUrl !== "" ? (
                          <img
                            src={holding.logoUrl}
                            alt={holding.ticker}
                            className="size-8 rounded-full border border-secondary"
                          />
                        ) : (
                          <div className="size-8 rounded-full bg-container-inset flex items-center justify-center text-xs font-medium text-secondary">
                            {holding.ticker.slice(0, 2) || "—"}
                          </div>
                        )}
                        <div className="max-w-32">
                          <p className="font-medium truncate">{holding.ticker}</p>
                          {holding.name !== null &&
                          holding.name !== undefined &&
                          holding.name !== "" ? (
                            <p className="text-xs text-secondary truncate" title={holding.name}>
                              {holding.name.length > 20
                                ? `${holding.name.slice(0, 20)}…`
                                : holding.name}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right text-secondary privacy-sensitive">
                      {typeof holding.weight === "number"
                        ? `${(holding.weight * 100).toFixed(1)}%`
                        : (holding.weight ?? "—")}
                    </td>
                    <td className="p-4 text-right privacy-sensitive">{holding.value.formatted}</td>
                    <td className="p-4 text-right">
                      {holding.returnPercent !== null &&
                      holding.returnPercent !== undefined &&
                      holding.returnPercent !== "" ? (
                        <span
                          className="privacy-sensitive"
                          style={
                            holding.returnColor !== null &&
                            holding.returnColor !== undefined &&
                            holding.returnColor !== ""
                              ? { color: holding.returnColor }
                              : undefined
                          }
                        >
                          {holding.returnPercent}
                        </span>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showActivity && summary.activity ? (
        <div className="bg-container-inset rounded-xl p-1 mx-4">
          <div className="px-4 py-2 flex items-center uppercase text-xs font-medium text-secondary">
            {summary.activity.label}
          </div>
          <div className="shadow-border-xs rounded-lg bg-container font-medium text-sm">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 p-1.5 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Icon name="chart-line" size="sm" className="text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-secondary">{text.contributions}</p>
                  <p className="font-medium text-primary privacy-sensitive">
                    {summary.activity.contributions.formatted}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 p-1.5 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <Icon name="arrow-down" size="sm" className="text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-secondary">{text.withdrawals}</p>
                  <p className="font-medium text-primary privacy-sensitive">
                    {summary.activity.withdrawals.formatted}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 p-1.5 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Icon name="arrow-left-right" size="sm" className="text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-secondary">{text.trades}</p>
                  <p className="font-medium text-primary">{summary.activity.tradesCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
