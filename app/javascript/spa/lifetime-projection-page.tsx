/* eslint-disable import/max-dependencies -- Route composes UI primitives, projection modules, and dialogs. */
import { useMemo, useState, type SyntheticEvent } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { type SummaryAccount, useSummaryQuery } from "./api/summary";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import {
  calculateLifetimeProjection,
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  LifetimeProjectionAssumptionsSchema,
  parseLifetimeProjectionInputs,
  type LifetimeProjectionAssumptions,
  type LifetimeProjectionPoint,
} from "./lifetime-projection";
import {
  computeBaselineDiff,
  formatBaselineDate,
  loadInitialLifetimePlan,
  refreshLifetimePlanBaseline,
  resetLifetimePlanToStarter,
  STARTER_LIFETIME_PLAN_VERSION,
  writeLifetimePlanSnapshot,
  type LifetimePlanBaseline,
} from "./lifetime-projection-storage";
import { ProjectionBaselineRefreshModal } from "./projection-baseline-refresh-modal";
import { ProjectionChart } from "./projection-chart";
import { ProjectionResetDialog } from "./projection-reset-dialog";
import { ProjectionYearBreakdown } from "./projection-year-breakdown";

const START_YEAR = new Date().getFullYear();

export type AssumptionFormValues = {
  annualIncome: string;
  annualSpending: string;
  inflationPercent: string;
  annualReturnPercent: string;
  horizonYears: string;
};

export type AssumptionFormErrors = Partial<Record<keyof AssumptionFormValues, string>>;

function toFormValues(assumptions: LifetimeProjectionAssumptions): AssumptionFormValues {
  return {
    annualIncome: String(assumptions.annualIncome),
    annualSpending: String(assumptions.annualSpending),
    inflationPercent: String(assumptions.inflationPercent),
    annualReturnPercent: String(assumptions.annualReturnPercent),
    horizonYears: String(assumptions.horizonYears),
  };
}

function cleanNumericInput(value: string): string {
  return value.replaceAll(/[$,\s]/gu, "").trim();
}

function validateHorizon(raw: string): string | undefined {
  if (raw.length === 0) return "Enter a projection horizon.";
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 100)
    return "Horizon must be a whole number between 1 and 100 years.";
  return undefined;
}

function validateIncome(raw: string): string | undefined {
  if (raw.length === 0) return "Enter annual income.";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "Enter a valid income amount.";
  if (num < 0) return "Annual income cannot be negative.";
  return undefined;
}

function validateSpending(raw: string): string | undefined {
  if (raw.length === 0) return "Enter annual spending.";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "Enter a valid spending amount.";
  if (num < 0) return "Annual spending cannot be negative.";
  return undefined;
}

function validateInflation(raw: string): string | undefined {
  if (raw.length === 0) return "Enter an inflation rate.";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "Enter a valid inflation rate.";
  if (num <= -100) return "Inflation rate must be greater than -100%.";
  return undefined;
}

function validateReturn(raw: string): string | undefined {
  if (raw.length === 0) return "Enter an investment return rate.";
  const num = Number(raw);
  if (!Number.isFinite(num)) return "Enter a valid return rate.";
  if (num <= -100) return "Investment return must be greater than -100%.";
  return undefined;
}

export function validateAssumptionForm(values: AssumptionFormValues): {
  errors: AssumptionFormErrors;
  parsed?: LifetimeProjectionAssumptions;
} {
  const errors: AssumptionFormErrors = {};

  const horizonError = validateHorizon(cleanNumericInput(values.horizonYears));
  if (horizonError !== undefined) errors.horizonYears = horizonError;

  const incomeError = validateIncome(cleanNumericInput(values.annualIncome));
  if (incomeError !== undefined) errors.annualIncome = incomeError;

  const spendingError = validateSpending(cleanNumericInput(values.annualSpending));
  if (spendingError !== undefined) errors.annualSpending = spendingError;

  const inflationError = validateInflation(cleanNumericInput(values.inflationPercent));
  if (inflationError !== undefined) errors.inflationPercent = inflationError;

  const returnError = validateReturn(cleanNumericInput(values.annualReturnPercent));
  if (returnError !== undefined) errors.annualReturnPercent = returnError;

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    parsed: LifetimeProjectionAssumptionsSchema.parse({
      annualIncome: Number(cleanNumericInput(values.annualIncome)),
      annualSpending: Number(cleanNumericInput(values.annualSpending)),
      inflationPercent: Number(cleanNumericInput(values.inflationPercent)),
      annualReturnPercent: Number(cleanNumericInput(values.annualReturnPercent)),
      horizonYears: Number(cleanNumericInput(values.horizonYears)),
    }),
  };
}

export function LifetimeProjectionPage() {
  const { bootstrap } = useRouteContext({ from: "__root__" });
  const summary = useSummaryQuery();

  let content: React.ReactNode;
  if (summary.isLoading) content = <ProjectionLoadingState />;
  else if (summary.error !== null || summary.data === undefined) {
    content = (
      <ProjectionErrorState
        description="Your current balances could not be loaded."
        onRetry={() => void summary.refetch()}
        title="Projection unavailable"
      />
    );
  } else {
    content = (
      <ProjectionResults
        accounts={summary.data.accounts}
        accountsPath={bootstrap.railsPaths.accounts}
        currency={summary.data.currency}
        currentNetWorth={summary.data.net_worth}
        key={bootstrap.currentUser.id}
        startingBalance={summary.data.net_worth_amount}
        userId={bootstrap.currentUser.id}
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
          See how today&apos;s finances could change over your projection horizon.
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

function ProjectionResults({
  accounts,
  accountsPath,
  currency,
  currentNetWorth,
  startingBalance,
  userId,
}: {
  accounts: SummaryAccount[];
  accountsPath: string;
  currency: string;
  currentNetWorth: string;
  startingBalance: number;
  userId: string;
}) {
  const initialPlan = useMemo(
    () => loadInitialLifetimePlan(userId, startingBalance, accounts),
    [userId, startingBalance, accounts],
  );

  const [activeBaseline, setActiveBaseline] = useState<LifetimePlanBaseline>(
    () => initialPlan.baseline,
  );
  const [appliedAssumptions, setAppliedAssumptions] = useState<LifetimeProjectionAssumptions>(
    () => initialPlan.assumptions,
  );
  const [formValues, setFormValues] = useState<AssumptionFormValues>(() =>
    toFormValues(initialPlan.assumptions),
  );
  const [formErrors, setFormErrors] = useState<AssumptionFormErrors>({});
  const [isSavedPlan, setIsSavedPlan] = useState<boolean>(() => initialPlan.isSaved);
  const [planType, setPlanType] = useState<"starter" | "custom">(() => initialPlan.planType);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState<boolean>(false);
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<number>(() => START_YEAR + 1);

  const baselineDiff = useMemo(
    () => computeBaselineDiff(activeBaseline, startingBalance, accounts),
    [activeBaseline, startingBalance, accounts],
  );

  const money = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  const projectionResult = useMemo(() => {
    try {
      const inputs = parseLifetimeProjectionInputs({
        startingBalance: activeBaseline.netWorth,
        ...appliedAssumptions,
        startYear: START_YEAR,
      });
      return {
        points: calculateLifetimeProjection(inputs),
        error: null,
      };
    } catch {
      return {
        points: [] as LifetimeProjectionPoint[],
        error: "We could not calculate this projection with the selected assumptions.",
      };
    }
  }, [activeBaseline.netWorth, appliedAssumptions]);

  const activeSelectedYear = useMemo(() => {
    const points = projectionResult.points;
    if (points.some((p) => p.year === selectedYear)) return selectedYear;
    if (points.length === 0) return START_YEAR;
    return points[Math.min(1, points.length - 1)].year;
  }, [projectionResult.points, selectedYear]);

  const hasUnappliedChanges = useMemo(() => {
    const horizonNum = Number(cleanNumericInput(formValues.horizonYears));
    const incomeNum = Number(cleanNumericInput(formValues.annualIncome));
    const spendingNum = Number(cleanNumericInput(formValues.annualSpending));
    const inflationNum = Number(cleanNumericInput(formValues.inflationPercent));
    const returnNum = Number(cleanNumericInput(formValues.annualReturnPercent));

    return (
      horizonNum !== appliedAssumptions.horizonYears ||
      incomeNum !== appliedAssumptions.annualIncome ||
      spendingNum !== appliedAssumptions.annualSpending ||
      inflationNum !== appliedAssumptions.inflationPercent ||
      returnNum !== appliedAssumptions.annualReturnPercent
    );
  }, [appliedAssumptions, formValues]);

  const isDefaultAssumptions = useMemo(
    () =>
      appliedAssumptions.annualIncome === DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualIncome &&
      appliedAssumptions.annualSpending ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualSpending &&
      appliedAssumptions.inflationPercent ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.inflationPercent &&
      appliedAssumptions.annualReturnPercent ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualReturnPercent &&
      appliedAssumptions.horizonYears === DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.horizonYears,
    [appliedAssumptions],
  );

  const handleFieldChange =
    (field: keyof AssumptionFormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
      if (formErrors[field] !== undefined)
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const handleFormSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validation = validateAssumptionForm(formValues);
    if (validation.parsed !== undefined) {
      setFormErrors({});
      setFormValues(toFormValues(validation.parsed));
      setAppliedAssumptions(validation.parsed);
      writeLifetimePlanSnapshot(userId, {
        version: STARTER_LIFETIME_PLAN_VERSION,
        planType: "custom",
        baseline: activeBaseline,
        assumptions: validation.parsed,
        updatedAt: new Date().toISOString(),
      });
      setPlanType("custom");
      setIsSavedPlan(true);
    } else setFormErrors(validation.errors);
  };

  const handleOpenResetDialog = () => {
    setIsResetDialogOpen(true);
  };

  const handleConfirmReset = () => {
    const starter = resetLifetimePlanToStarter(userId, startingBalance, accounts);
    setFormErrors({});
    setFormValues(toFormValues(starter.assumptions));
    setAppliedAssumptions(starter.assumptions);
    setActiveBaseline(starter.baseline);
    setPlanType("starter");
    setIsSavedPlan(true);
    setIsResetDialogOpen(false);
  };

  const handleConfirmBaselineRefresh = () => {
    const refreshed = refreshLifetimePlanBaseline(userId, startingBalance, accounts);
    if (refreshed !== undefined) {
      setActiveBaseline(refreshed.baseline);
      setIsSavedPlan(true);
    }
    setIsRefreshModalOpen(false);
  };

  const { points, error } = projectionResult;
  const finalPoint = points.at(-1);

  return (
    <div className="space-y-6">
      <section aria-labelledby="projection-assumptions-title" className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-primary" id="projection-assumptions-title">
            Starting point and assumptions
          </h2>
          <p className="mt-1 text-sm text-secondary">
            Assumptions are entered as nominal amounts in today&apos;s dollars. The projection below
            adjusts future income, spending, and net worth for inflation and compound returns year
            by year.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl bg-container p-5 shadow-border-xs lg:col-span-1">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-secondary">
                  Current net worth
                </span>
                {baselineDiff.hasDiff ? (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                    Differs
                  </span>
                ) : (
                  <span className="rounded-full bg-container-inset px-2 py-0.5 text-xs text-secondary">
                    Synced
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-medium tabular-nums text-primary privacy-sensitive">
                {money.format(activeBaseline.netWorth)}
              </div>
              <p className="mt-1 text-xs text-secondary">
                Saved baseline captured {formatBaselineDate(activeBaseline.capturedAt)}. Serves as
                Year 0.
              </p>
              {baselineDiff.hasDiff ? (
                <div
                  aria-label="Baseline difference notice"
                  className="mt-3 space-y-2 rounded-lg border border-secondary bg-container-inset p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-secondary">Current live balance:</span>
                    <span className="font-medium text-primary privacy-sensitive">
                      {currentNetWorth}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-secondary">Difference:</span>
                    <span className="font-medium text-primary privacy-sensitive">
                      {baselineDiff.netWorthDelta >= 0 ? "+" : ""}
                      {money.format(baselineDiff.netWorthDelta)}
                    </span>
                  </div>
                  <Button
                    className="mt-1 w-full"
                    onClick={() => {
                      setIsRefreshModalOpen(true);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Review changes
                  </Button>
                </div>
              ) : accounts.length === 0 ? (
                <div className="mt-3 space-y-1 rounded-lg border border-secondary bg-container-inset p-3 text-xs text-secondary">
                  <p className="font-medium text-primary">No accounts connected yet</p>
                  <p>
                    Modeling scenarios with a starter baseline ($0). You can experiment freely or{" "}
                    <a className="font-medium text-link hover:underline" href={accountsPath}>
                      connect accounts
                    </a>{" "}
                    to load live balances.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-secondary">
                  Live balance from accounts in your family finances.
                </p>
              )}
            </div>
            <div className="mt-4 rounded-lg bg-container-inset p-3 text-xs text-secondary">
              <p className="font-medium text-primary">Nominal vs. adjusted</p>
              <p className="mt-1">
                Income and spending inputs represent today&apos;s purchasing power. The projection
                compounds inflation into future cash flows.
              </p>
            </div>
          </div>

          <form
            aria-label="Projection assumptions"
            className="space-y-4 rounded-xl bg-container p-5 shadow-border-xs lg:col-span-3"
            noValidate
            onSubmit={handleFormSubmit}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormField
                actions={<span className="text-xs text-secondary">years</span>}
                description="Total window to simulate (1 to 100 years)."
                error={formErrors.horizonYears}
                id="projection-horizon-years"
                inputMode="numeric"
                label="Projection horizon"
                name="horizonYears"
                onChange={handleFieldChange("horizonYears")}
                required
                value={formValues.horizonYears}
              />
              <FormField
                actions={<span className="text-xs text-secondary">today&apos;s dollars</span>}
                description="Nominal starting income before inflation."
                error={formErrors.annualIncome}
                id="projection-annual-income"
                inputMode="decimal"
                label="Annual income"
                name="annualIncome"
                onChange={handleFieldChange("annualIncome")}
                required
                value={formValues.annualIncome}
              />
              <FormField
                actions={<span className="text-xs text-secondary">today&apos;s dollars</span>}
                description="Nominal starting spending before inflation."
                error={formErrors.annualSpending}
                id="projection-annual-spending"
                inputMode="decimal"
                label="Annual spending"
                name="annualSpending"
                onChange={handleFieldChange("annualSpending")}
                required
                value={formValues.annualSpending}
              />
              <FormField
                actions={<span className="text-xs text-secondary">% / year</span>}
                description="Compounded onto income and spending annually."
                error={formErrors.inflationPercent}
                id="projection-inflation-percent"
                inputMode="decimal"
                label="Inflation rate"
                name="inflationPercent"
                onChange={handleFieldChange("inflationPercent")}
                required
                value={formValues.inflationPercent}
              />
              <FormField
                actions={<span className="text-xs text-secondary">% / year</span>}
                description="Compounded onto projected balance annually."
                error={formErrors.annualReturnPercent}
                id="projection-annual-return-percent"
                inputMode="decimal"
                label="Investment return"
                name="annualReturnPercent"
                onChange={handleFieldChange("annualReturnPercent")}
                required
                value={formValues.annualReturnPercent}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary pt-3">
              <div className="text-xs text-secondary">
                {hasUnappliedChanges ? (
                  <span className="font-medium text-primary">
                    You have unapplied assumption changes.
                  </span>
                ) : planType === "starter" ? (
                  <span>Starter plan saved in this browser.</span>
                ) : isSavedPlan ? (
                  <span>Plan saved in this browser.</span>
                ) : (
                  <span>Inputs reflect the active projection below.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  disabled={planType === "starter" && !hasUnappliedChanges && isDefaultAssumptions}
                  onClick={handleOpenResetDialog}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Reset to defaults
                </Button>
                <Button size="sm" type="submit" variant="primary">
                  Apply changes
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {error !== null ? (
        <section
          aria-live="assertive"
          className="flex flex-col items-center justify-center rounded-xl border border-destructive bg-container px-6 py-12 text-center shadow-border-xs"
          role="alert"
        >
          <Icon className="text-destructive" name="circle-alert" size="lg" />
          <p className="mt-3 font-medium text-primary">Calculation error</p>
          <p className="mt-1 max-w-md text-sm text-secondary">{error}</p>
        </section>
      ) : (
        <section
          aria-labelledby="projection-results-title"
          className="overflow-hidden rounded-xl bg-container shadow-border-xs"
        >
          <div className="border-b border-secondary px-5 py-4">
            <h2 className="text-lg font-medium text-primary" id="projection-results-title">
              Year-by-year projection
            </h2>
            <p className="mt-1 text-sm text-secondary">
              The first row is today&apos;s net worth (nominal). Later rows show future income and
              spending adjusted for {appliedAssumptions.inflationPercent}% annual inflation, with
              net worth compounding at {appliedAssumptions.annualReturnPercent}% annual return.
            </p>
          </div>

          <figure className="border-b border-secondary px-4 py-5 sm:px-5">
            <ProjectionChart
              horizonYears={appliedAssumptions.horizonYears}
              money={money}
              points={points}
            />
            <figcaption className="mt-3 text-center text-sm font-medium tabular-nums text-primary privacy-sensitive">
              Projected net worth in {finalPoint?.year}: {money.format(finalPoint?.netWorth ?? 0)} (
              {appliedAssumptions.horizonYears}-year horizon)
            </figcaption>
          </figure>

          {points.length > 0 ? (
            <div className="border-b border-secondary bg-container-inset/30 p-4 sm:p-5">
              <ProjectionYearBreakdown
                annualReturnPercent={appliedAssumptions.annualReturnPercent}
                inflationPercent={appliedAssumptions.inflationPercent}
                money={money}
                onSelectYear={setSelectedYear}
                points={points}
                selectedYear={activeSelectedYear}
              />
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-180">
              <caption className="sr-only">Lifetime net worth projection by year</caption>
              <thead className="bg-container-inset">
                <tr>
                  <ProjectionHeading align="left">Year</ProjectionHeading>
                  <ProjectionHeading>Income (adjusted)</ProjectionHeading>
                  <ProjectionHeading>Spending (adjusted)</ProjectionHeading>
                  <ProjectionHeading>Income − spending</ProjectionHeading>
                  <ProjectionHeading>Projected net worth</ProjectionHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary">
                {points.map((point, index) => {
                  const isSelected = point.year === activeSelectedYear;
                  return (
                    <tr
                      aria-selected={isSelected}
                      className={`cursor-pointer transition-colors hover:bg-surface-hover ${
                        isSelected ? "bg-container-inset font-medium" : ""
                      }`}
                      key={point.year}
                      onClick={() => {
                        setSelectedYear(point.year);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedYear(point.year);
                        }
                      }}
                      tabIndex={0}
                    >
                      <th
                        className="px-4 py-3 text-left text-sm font-medium tabular-nums text-primary"
                        scope="row"
                      >
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full bg-current text-primary"
                            />
                          ) : null}
                          <span>{point.year}</span>
                        </div>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ProjectionResetDialog
        isOpen={isResetDialogOpen}
        onCancel={() => {
          setIsResetDialogOpen(false);
        }}
        onConfirm={handleConfirmReset}
      />

      <ProjectionBaselineRefreshModal
        diff={baselineDiff}
        isOpen={isRefreshModalOpen}
        money={money}
        onClose={() => {
          setIsRefreshModalOpen(false);
        }}
        onConfirmRefresh={handleConfirmBaselineRefresh}
      />
    </div>
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
