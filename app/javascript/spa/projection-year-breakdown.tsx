import { useMemo } from "react";
import { Icon } from "./icon";
import type { LifetimeProjectionPoint } from "./lifetime-projection";

export function ProjectionYearBreakdown({
  annualReturnPercent,
  inflationPercent,
  money,
  onSelectYear,
  points,
  selectedYear,
}: {
  annualReturnPercent: number;
  inflationPercent: number;
  money: Intl.NumberFormat;
  onSelectYear: (year: number) => void;
  points: LifetimeProjectionPoint[];
  selectedYear: number;
}) {
  const selectedIndex = useMemo(() => {
    const idx = points.findIndex((p) => p.year === selectedYear);
    return idx >= 0 ? idx : Math.min(1, points.length - 1);
  }, [points, selectedYear]);

  const selectedPoint = points[selectedIndex];
  const isBaselineYear = selectedIndex === 0;
  const isDepleted = selectedPoint.netWorth < 0;

  const startingValue = selectedPoint.startingNetWorth;
  const investmentGrowth = selectedPoint.investmentGrowth ?? 0;
  const annualIncome = selectedPoint.annualIncome ?? 0;
  const annualSpending = selectedPoint.annualSpending ?? 0;
  const baseIncome = selectedPoint.baseIncome ?? 0;
  const baseSpending = selectedPoint.baseSpending ?? 0;
  const incomeInflation = selectedPoint.incomeInflation ?? 0;
  const spendingInflation = selectedPoint.spendingInflation ?? 0;
  const inflationEffect = selectedPoint.inflationEffect ?? 0;
  const endingValue = selectedPoint.netWorth;

  const handlePrev = () => {
    if (selectedIndex > 0) onSelectYear(points[selectedIndex - 1].year);
  };

  const handleNext = () => {
    if (selectedIndex < points.length - 1) onSelectYear(points[selectedIndex + 1].year);
  };

  return (
    <section
      aria-labelledby="year-breakdown-heading"
      className="space-y-4 rounded-xl bg-container p-5 shadow-border-xs"
      data-testid="projection-year-breakdown"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-primary" id="year-breakdown-heading">
              Year {selectedPoint.year} breakdown
            </h3>
            <span className="rounded-full bg-container-inset px-2.5 py-0.5 text-xs font-medium text-secondary">
              {isBaselineYear
                ? "Starting baseline"
                : `Year ${selectedIndex} of ${points.length - 1}`}
            </span>
            {isDepleted ? (
              <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
                Depleted
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-secondary">
            {isBaselineYear
              ? "Live starting balances from accounts in your finances (Year 0)."
              : `Reconciled ledger from Jan 1, ${selectedPoint.year} to Dec 31, ${selectedPoint.year}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label="Previous projected year"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-secondary text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-40"
            disabled={selectedIndex === 0}
            onClick={handlePrev}
            type="button"
          >
            <Icon name="chevron-left" size="sm" />
          </button>

          <label className="sr-only" htmlFor="projection-year-select">
            Select projected year
          </label>
          <select
            className="h-8 rounded-lg border border-secondary bg-container px-2 text-xs font-medium text-primary focus-ring"
            id="projection-year-select"
            onChange={(event) => {
              onSelectYear(Number(event.target.value));
            }}
            value={selectedPoint.year}
          >
            {points.map((point, index) => (
              <option key={point.year} value={point.year}>
                {point.year} {index === 0 ? "(Baseline)" : `(Year ${index})`}
              </option>
            ))}
          </select>

          <button
            aria-label="Next projected year"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-secondary text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-40"
            disabled={selectedIndex === points.length - 1}
            onClick={handleNext}
            type="button"
          >
            <Icon name="chevron-right" size="sm" />
          </button>
        </div>
      </div>

      {isBaselineYear ? (
        <div className="rounded-lg bg-container-inset p-4 text-sm text-secondary">
          <p className="font-medium text-primary">
            Baseline net worth: {money.format(endingValue)}
          </p>
          <p className="mt-1">
            This is today&apos;s starting baseline from your accounts. Annual income, spending,
            inflation compounding, and investment returns begin in {points[1]?.year}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {isDepleted ? (
            <div
              aria-live="polite"
              className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              role="alert"
            >
              <Icon className="mt-0.5 shrink-0" name="circle-alert" size="sm" />
              <div>
                <p className="font-medium">Plan depleted in {selectedPoint.year}</p>
                <p className="mt-1 text-xs opacity-90">
                  Annual spending has exceeded cumulative income and starting assets. Net worth
                  dropped below zero to {money.format(endingValue)}. Negative balances accumulate at
                  the annual return/borrowing rate rather than clamping to zero.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Starting value
              </span>
              <span className="mt-1 block text-lg font-medium tabular-nums text-primary privacy-sensitive">
                {money.format(startingValue)}
              </span>
              <span className="text-xs text-secondary">Jan 1 baseline</span>
            </div>

            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Investment growth
              </span>
              <span
                className={`mt-1 block text-lg font-medium tabular-nums privacy-sensitive ${investmentGrowth >= 0 ? "text-success" : "text-destructive"}`}
              >
                {investmentGrowth >= 0 ? "+" : ""}
                {money.format(investmentGrowth)}
              </span>
              <span className="text-xs text-secondary">{annualReturnPercent}% annual return</span>
            </div>

            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Annual income
              </span>
              <span className="mt-1 block text-lg font-medium tabular-nums text-success privacy-sensitive">
                +{money.format(annualIncome)}
              </span>
              <span className="text-xs text-secondary">
                Base {money.format(baseIncome)} + {money.format(incomeInflation)} infl.
              </span>
            </div>

            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Annual spending
              </span>
              <span className="mt-1 block text-lg font-medium tabular-nums text-destructive privacy-sensitive">
                −{money.format(annualSpending)}
              </span>
              <span className="text-xs text-secondary">
                Base {money.format(baseSpending)} + {money.format(spendingInflation)} infl.
              </span>
            </div>

            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Inflation effect
              </span>
              <span
                className={`mt-1 block text-lg font-medium tabular-nums privacy-sensitive ${inflationEffect >= 0 ? "text-primary" : "text-destructive"}`}
              >
                {inflationEffect >= 0 ? "+" : ""}
                {money.format(inflationEffect)}
              </span>
              <span className="text-xs text-secondary">Net cash flow impact</span>
            </div>

            <div className="rounded-lg bg-container-inset p-3">
              <span className="block text-xs font-medium uppercase tracking-wide text-secondary">
                Ending value
              </span>
              <span
                className={`mt-1 block text-lg font-semibold tabular-nums privacy-sensitive ${endingValue >= 0 ? "text-primary" : "text-destructive"}`}
              >
                {money.format(endingValue)}
              </span>
              <span className="text-xs text-secondary">Dec 31 balance</span>
            </div>
          </div>

          <div className="rounded-lg border border-secondary p-3 text-xs text-secondary">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-primary">Ledger reconciliation formula:</span>
              <span className="tabular-nums">
                Starting ({money.format(startingValue)}) + Return ({money.format(investmentGrowth)})
                + Income ({money.format(annualIncome)}) − Spending ({money.format(annualSpending)})
                = Ending ({money.format(endingValue)})
              </span>
            </div>
            <p className="mt-1 text-xs opacity-80">
              Future cash flows reflect {inflationPercent}% inflation compounding from base income (
              {money.format(baseIncome)}) and base spending ({money.format(baseSpending)}). All
              components reconcile exactly to the ending value.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
