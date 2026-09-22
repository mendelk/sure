import { useMemo } from "react";
import { defineChart, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { useRouteContext } from "@tanstack/react-router";
import { useSummaryQuery } from "./api/summary";
import { Icon } from "./icon";
import {
  calculateLifetimeProjection,
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  parseLifetimeProjectionInputs,
  type LifetimeProjectionPoint,
} from "./lifetime-projection";

const START_YEAR = new Date().getFullYear();

type ProjectionResult = {
  money: Intl.NumberFormat;
  points: LifetimeProjectionPoint[];
};

export function LifetimeProjectionPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const summary = useSummaryQuery();

  let content: React.ReactNode;
  if (summary.isLoading) content = <ProjectionLoadingState />;
  else if (summary.error !== null || summary.data === undefined) {
    content = (
      <ProjectionErrorState
        description="Your current balances could not be loaded."
        title="Projection unavailable"
        onRetry={() => void summary.refetch()}
      />
    );
  } else if (summary.data.accounts.length === 0) {
    content = (
      <ProjectionEmptyState
        accountsPath={bootstrap.railsPaths.accounts}
        description="A lifetime projection needs at least one account as its starting point."
        title="Add an account to start a projection"
      />
    );
  } else {
    const result = buildProjectionResult(summary.data.net_worth_amount, summary.data.currency);
    content =
      result === undefined ? (
        <ProjectionErrorState
          description="One or more assumptions are invalid. Review the values and try again."
          title="We could not calculate this projection"
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <ProjectionResults
          currentNetWorth={summary.data.net_worth}
          money={result.money}
          points={result.points}
        />
      );
  }

  return (
    <section aria-labelledby="lifetime-projection-title" className="@container space-y-6 pb-12">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-primary" id="lifetime-projection-title">
            Lifetime projection
          </h1>
          <span className="rounded-full bg-violet-tint-10 px-2 py-0.5 text-xs font-medium text-secondary">
            Preview
          </span>
        </div>
        <p className="mt-1 text-sm text-secondary">
          See how today&apos;s finances could change over the next 30 years.
        </p>
      </header>

      {content}

      <aside className="flex items-start gap-3 rounded-lg bg-container-inset px-4 py-3 text-sm text-secondary">
        <Icon className="mt-0.5" name="circle-alert" size="sm" />
        <p>
          This projection is an estimate for planning, not a guarantee or financial advice. It reads
          your current balances without changing accounts or reports.
        </p>
      </aside>
    </section>
  );
}

function buildProjectionResult(
  startingBalance: number,
  currency: string,
): ProjectionResult | undefined {
  try {
    return {
      money: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
      points: calculateLifetimeProjection(
        parseLifetimeProjectionInputs({
          startingBalance,
          ...DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
          startYear: START_YEAR,
        }),
      ),
    };
  } catch {
    return undefined;
  }
}

function ProjectionResults({
  currentNetWorth,
  money,
  points,
}: {
  currentNetWorth: string;
  money: Intl.NumberFormat;
  points: LifetimeProjectionPoint[];
}) {
  const assumptions = [
    {
      label: "Current net worth",
      value: currentNetWorth,
      help: "Live balance from the accounts included in your finances.",
      private: true,
    },
    {
      label: "Annual income",
      value: money.format(DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualIncome),
      help: "Starting estimate before inflation.",
      private: true,
    },
    {
      label: "Annual spending",
      value: money.format(DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualSpending),
      help: "Starting estimate before inflation.",
      private: true,
    },
    {
      label: "Inflation",
      value: `${DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.inflationPercent.toFixed(1)}%`,
      help: "Applied to income and spending each year.",
      private: false,
    },
    {
      label: "Annual return",
      value: `${DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualReturnPercent.toFixed(1)}%`,
      help: "Applied to projected net worth each year.",
      private: false,
    },
    {
      label: "Projection horizon",
      value: `${DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.horizonYears} years`,
      help: "A fixed year-by-year planning window.",
      private: false,
    },
  ];
  const finalPoint = points.at(-1);

  return (
    <div className="space-y-6">
      <section aria-labelledby="projection-assumptions-title" className="space-y-3">
        <div>
          <h2 className="text-lg font-medium text-primary" id="projection-assumptions-title">
            Starting point and assumptions
          </h2>
          <p className="mt-1 text-sm text-secondary">
            Each year applies the return to projected net worth, then adds income minus spending.
            Income and spending both rise with inflation.
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
          {assumptions.map((assumption) => (
            <div
              className="rounded-xl bg-container px-5 py-4 shadow-border-xs"
              key={assumption.label}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-secondary">
                {assumption.label}
              </dt>
              <dd
                className={`mt-2 text-2xl font-medium tabular-nums text-primary ${assumption.private ? "privacy-sensitive" : ""}`}
              >
                {assumption.value}
              </dd>
              <p className="mt-1 text-xs text-secondary">{assumption.help}</p>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="projection-results-title"
        className="overflow-hidden rounded-xl bg-container shadow-border-xs"
      >
        <div className="border-b border-secondary px-5 py-4">
          <h2 className="text-lg font-medium text-primary" id="projection-results-title">
            Year-by-year projection
          </h2>
          <p className="mt-1 text-sm text-secondary">
            The first row is today&apos;s net worth. Later rows show end-of-year estimates.
          </p>
        </div>

        <figure className="border-b border-secondary px-4 py-5 sm:px-5">
          <ProjectionChart money={money} points={points} />
          <figcaption className="mt-3 text-center text-sm font-medium tabular-nums text-primary privacy-sensitive">
            Projected net worth in {finalPoint?.year}: {money.format(finalPoint?.netWorth ?? 0)}
          </figcaption>
        </figure>

        <div className="overflow-x-auto">
          <table className="w-full min-w-180">
            <caption className="sr-only">Lifetime net worth projection by year</caption>
            <thead className="bg-container-inset">
              <tr>
                <ProjectionHeading align="left">Year</ProjectionHeading>
                <ProjectionHeading>Income</ProjectionHeading>
                <ProjectionHeading>Spending</ProjectionHeading>
                <ProjectionHeading>Income − spending</ProjectionHeading>
                <ProjectionHeading>Projected net worth</ProjectionHeading>
              </tr>
            </thead>
            <tbody className="divide-y divide-tertiary">
              {points.map((point, index) => (
                <tr className="hover:bg-surface-hover" key={point.year}>
                  <th
                    className="px-4 py-3 text-left text-sm font-medium tabular-nums text-primary"
                    scope="row"
                  >
                    {point.year}
                  </th>
                  <ProjectionMoneyCell
                    money={money}
                    value={index === 0 ? null : point.annualIncome}
                  />
                  <ProjectionMoneyCell
                    money={money}
                    value={index === 0 ? null : point.annualSpending}
                  />
                  <ProjectionMoneyCell
                    money={money}
                    value={index === 0 ? null : point.annualSavings}
                  />
                  <ProjectionMoneyCell emphasis money={money} value={point.netWorth} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProjectionChart({
  money,
  points,
}: {
  money: Intl.NumberFormat;
  points: LifetimeProjectionPoint[];
}) {
  const definition = useMemo(() => {
    const tickInterval = Math.max(1, Math.ceil((points.length - 1) / 5));
    const tickYears = points
      .filter((_, index) => index % tickInterval === 0 || index === points.length - 1)
      .map((point) => point.year);

    return defineChart({
      marks: [
        lineY(points, {
          x: "year",
          y: "netWorth",
          points: true,
          strokeWidth: 3,
        }),
      ],
      scales: {
        x: {
          scale: () => scalePoint().padding(0.5),
          axis: {
            label: "Year",
            ticks: { values: tickYears },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            label: "Projected net worth",
            ticks: { format: (value: number) => money.format(value) },
          },
        },
      },
      tooltip,
    });
  }, [money, points]);

  return (
    <Chart
      ariaLabel={`Projected net worth over ${DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.horizonYears} years`}
      definition={definition}
      height={256}
    />
  );
}

function ProjectionHeading({
  align = "right",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-secondary ${align === "left" ? "text-left" : "text-right"}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function ProjectionMoneyCell({
  emphasis = false,
  money,
  value,
}: {
  emphasis?: boolean;
  money: Intl.NumberFormat;
  value: number | null;
}) {
  return (
    <td
      className={`px-4 py-3 text-right text-sm tabular-nums privacy-sensitive ${emphasis ? "font-medium text-primary" : "text-secondary"}`}
    >
      {value === null ? "—" : money.format(value)}
    </td>
  );
}

function ProjectionLoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Calculating your projection…</span>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-32 animate-pulse rounded-xl bg-container shadow-border-xs"
            key={index}
          />
        ))}
      </div>
      <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl bg-container text-secondary shadow-border-xs">
        <Icon className="animate-spin" name="loader-circle" />
        <span className="text-sm font-medium">Calculating your projection…</span>
      </div>
    </div>
  );
}

function ProjectionEmptyState({
  accountsPath,
  description,
  title,
}: {
  accountsPath: string;
  description: string;
  title: string;
}) {
  return (
    <section className="flex flex-col items-center justify-center rounded-xl bg-container px-6 py-24 text-center shadow-border-xs">
      <Icon name="chart-bar" size="lg" />
      <p className="mt-4 font-medium text-primary">{title}</p>
      <p className="mt-1 max-w-md text-sm text-secondary">{description}</p>
      <a
        className="mt-4 inline-flex min-h-9 items-center rounded-lg button-bg-primary px-3 text-sm font-medium text-inverse transition-colors hover:button-bg-primary-hover focus-ring"
        href={accountsPath}
      >
        Review accounts
      </a>
    </section>
  );
}

function ProjectionErrorState({
  description,
  onRetry,
  title,
}: {
  description: string;
  onRetry: () => void;
  title: string;
}) {
  return (
    <section
      aria-live="assertive"
      className="flex flex-col items-center justify-center rounded-xl border border-destructive bg-container px-6 py-24 text-center"
      role="alert"
    >
      <Icon className="text-destructive" name="circle-alert" size="lg" />
      <p className="mt-4 font-medium text-primary">{title}</p>
      <p className="mt-1 max-w-md text-sm text-secondary">{description}</p>
      <button
        className="mt-4 text-sm font-medium text-link hover:underline"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
