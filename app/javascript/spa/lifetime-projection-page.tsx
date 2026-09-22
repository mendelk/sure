/* eslint-disable import/max-dependencies -- Route composes UI primitives, projection modules, and dialogs. */
import { useMemo, useState, type SyntheticEvent } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { type SummaryAccount, useSummaryQuery } from "./api/summary";
import { Button } from "./components/button";
import { FormField } from "./components/form-field";
import { Icon } from "./icon";
import {
  calculateLifetimeProjection,
  createDefaultHousehold,
  createDefaultPartner,
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  getHorizonToCoverAllMilestones,
  getOutOfHorizonMilestones,
  evaluateAllGoals,
  HouseholdSchema,
  LifetimeProjectionAssumptionsSchema,
  parseLifetimeProjectionInputs,
  type CashFlowMode,
  type Household,
  type HouseholdMember,
  type LifetimeProjectionAssumptions,
  type LifetimeProjectionPoint,
  type ProjectionEvent,
  type ProjectionGoal,
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
import { ProjectionEventDialog } from "./projection-event-dialog";
import { ProjectionGoalDialog } from "./projection-goal-dialog";
import { ProjectionResetDialog } from "./projection-reset-dialog";
import { ProjectionYearBreakdown } from "./projection-year-breakdown";

const START_YEAR = new Date().getFullYear();

export type HouseholdMemberFormValues = {
  id: string;
  name: string;
  birthYear: string;
  retirementAge: string;
  planningEndAge: string;
};

export type HouseholdMemberFormErrors = {
  name?: string;
  birthYear?: string;
  retirementAge?: string;
  planningEndAge?: string;
};

export type HouseholdFormValues = {
  isCouple: boolean;
  primary: HouseholdMemberFormValues;
  partner?: HouseholdMemberFormValues;
};

export type AssumptionFormValues = {
  annualIncome: string;
  annualSpending: string;
  inflationPercent: string;
  annualReturnPercent: string;
  horizonYears: string;
  household: HouseholdFormValues;
};

export type AssumptionFormErrors = {
  annualIncome?: string;
  annualSpending?: string;
  inflationPercent?: string;
  annualReturnPercent?: string;
  horizonYears?: string;
  primary?: HouseholdMemberFormErrors;
  partner?: HouseholdMemberFormErrors;
};

function toMemberFormValues(member: HouseholdMember): HouseholdMemberFormValues {
  return {
    id: member.id,
    name: member.name,
    birthYear: String(member.birthYear),
    retirementAge: String(member.retirementAge),
    planningEndAge: String(member.planningEndAge),
  };
}

function toHouseholdFormValues(household: Household): HouseholdFormValues {
  const primary = household.members[0] ?? createDefaultHousehold(START_YEAR).members[0];
  const partner = household.members[1] ?? createDefaultPartner(START_YEAR);
  return {
    isCouple: household.members.length > 1,
    primary: toMemberFormValues(primary),
    partner: toMemberFormValues(partner),
  };
}

function toFormValues(
  assumptions: LifetimeProjectionAssumptions,
  household: Household,
): AssumptionFormValues {
  return {
    annualIncome: String(assumptions.annualIncome),
    annualSpending: String(assumptions.annualSpending),
    inflationPercent: String(assumptions.inflationPercent),
    annualReturnPercent: String(assumptions.annualReturnPercent),
    horizonYears: String(assumptions.horizonYears),
    household: toHouseholdFormValues(household),
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

function validateMemberName(raw: string): string | undefined {
  if (raw.trim().length === 0) return "Enter a name.";
  return undefined;
}

function validateBirthYear(raw: string, startYear: number): string | undefined {
  if (raw.length === 0) return "Enter birth year.";
  const num = Number(cleanNumericInput(raw));
  if (!Number.isFinite(num) || !Number.isInteger(num)) return "Enter a valid year.";
  if (num < 1900) return "Birth year must be 1900 or later.";
  if (num > startYear) return "Birth year cannot be in the future.";
  return undefined;
}

function validateRetirementAge(raw: string): string | undefined {
  if (raw.length === 0) return "Enter retirement age.";
  const num = Number(cleanNumericInput(raw));
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 18 || num > 120)
    return "Retirement age must be between 18 and 120.";
  return undefined;
}

function validatePlanningEndAge(
  raw: string,
  retirementAgeRaw: string,
  birthYearRaw: string,
  startYear: number,
): string | undefined {
  if (raw.length === 0) return "Enter planning end age.";
  const num = Number(cleanNumericInput(raw));
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 18 || num > 120)
    return "Planning end age must be between 18 and 120.";

  const birthYearNum = Number(cleanNumericInput(birthYearRaw));
  if (Number.isFinite(birthYearNum)) {
    const currentAge = startYear - birthYearNum;
    if (num < currentAge)
      return `Planning end age cannot be less than current age (${currentAge}).`;
  }

  const retAgeNum = Number(cleanNumericInput(retirementAgeRaw));
  if (Number.isFinite(retAgeNum) && num < retAgeNum)
    return "Planning end age must be at or after retirement age.";

  return undefined;
}

export function validateAssumptionForm(
  values: AssumptionFormValues,
  startYear = START_YEAR,
): {
  errors: AssumptionFormErrors;
  parsedAssumptions?: LifetimeProjectionAssumptions;
  parsedHousehold?: Household;
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

  const primaryErrors: HouseholdMemberFormErrors = {};
  const primaryNameError = validateMemberName(values.household.primary.name);
  if (primaryNameError !== undefined) primaryErrors.name = primaryNameError;

  const primaryBirthYearError = validateBirthYear(values.household.primary.birthYear, startYear);
  if (primaryBirthYearError !== undefined) primaryErrors.birthYear = primaryBirthYearError;

  const primaryRetirementError = validateRetirementAge(values.household.primary.retirementAge);
  if (primaryRetirementError !== undefined) primaryErrors.retirementAge = primaryRetirementError;

  const primaryEndAgeError = validatePlanningEndAge(
    values.household.primary.planningEndAge,
    values.household.primary.retirementAge,
    values.household.primary.birthYear,
    startYear,
  );
  if (primaryEndAgeError !== undefined) primaryErrors.planningEndAge = primaryEndAgeError;

  if (Object.keys(primaryErrors).length > 0) errors.primary = primaryErrors;

  let partnerErrors: HouseholdMemberFormErrors | undefined;
  if (values.household.isCouple && values.household.partner) {
    partnerErrors = {};
    const partnerNameError = validateMemberName(values.household.partner.name);
    if (partnerNameError !== undefined) partnerErrors.name = partnerNameError;

    const partnerBirthYearError = validateBirthYear(values.household.partner.birthYear, startYear);
    if (partnerBirthYearError !== undefined) partnerErrors.birthYear = partnerBirthYearError;

    const partnerRetirementError = validateRetirementAge(values.household.partner.retirementAge);
    if (partnerRetirementError !== undefined) partnerErrors.retirementAge = partnerRetirementError;

    const partnerEndAgeError = validatePlanningEndAge(
      values.household.partner.planningEndAge,
      values.household.partner.retirementAge,
      values.household.partner.birthYear,
      startYear,
    );
    if (partnerEndAgeError !== undefined) partnerErrors.planningEndAge = partnerEndAgeError;

    if (Object.keys(partnerErrors).length > 0) errors.partner = partnerErrors;
  }

  if (Object.keys(errors).length > 0) return { errors };

  const members: HouseholdMember[] = [
    {
      id: values.household.primary.id || "primary",
      name: values.household.primary.name.trim(),
      birthYear: Number(cleanNumericInput(values.household.primary.birthYear)),
      retirementAge: Number(cleanNumericInput(values.household.primary.retirementAge)),
      planningEndAge: Number(cleanNumericInput(values.household.primary.planningEndAge)),
    },
  ];

  if (values.household.isCouple && values.household.partner) {
    members.push({
      id: values.household.partner.id || "partner",
      name: values.household.partner.name.trim(),
      birthYear: Number(cleanNumericInput(values.household.partner.birthYear)),
      retirementAge: Number(cleanNumericInput(values.household.partner.retirementAge)),
      planningEndAge: Number(cleanNumericInput(values.household.partner.planningEndAge)),
    });
  }

  return {
    errors: {},
    parsedAssumptions: LifetimeProjectionAssumptionsSchema.parse({
      annualIncome: Number(cleanNumericInput(values.annualIncome)),
      annualSpending: Number(cleanNumericInput(values.annualSpending)),
      inflationPercent: Number(cleanNumericInput(values.inflationPercent)),
      annualReturnPercent: Number(cleanNumericInput(values.annualReturnPercent)),
      horizonYears: Number(cleanNumericInput(values.horizonYears)),
    }),
    parsedHousehold: HouseholdSchema.parse({ members }),
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
    () => loadInitialLifetimePlan(userId, startingBalance, accounts, START_YEAR),
    [userId, startingBalance, accounts],
  );

  const [activeBaseline, setActiveBaseline] = useState<LifetimePlanBaseline>(
    () => initialPlan.baseline,
  );
  const [appliedAssumptions, setAppliedAssumptions] = useState<LifetimeProjectionAssumptions>(
    () => initialPlan.assumptions,
  );
  const [appliedHousehold, setAppliedHousehold] = useState<Household>(() => initialPlan.household);
  const [cashFlowMode, setCashFlowMode] = useState<CashFlowMode>(() => initialPlan.cashFlowMode);
  const [events, setEvents] = useState<ProjectionEvent[]>(() => initialPlan.events);
  const [goals, setGoals] = useState<ProjectionGoal[]>(() => initialPlan.goals);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<ProjectionEvent | null>(null);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<ProjectionGoal | null>(null);
  const [formValues, setFormValues] = useState<AssumptionFormValues>(() =>
    toFormValues(initialPlan.assumptions, initialPlan.household),
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
        household: appliedHousehold,
        cashFlowMode,
        events,
        goals,
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
  }, [activeBaseline.netWorth, appliedAssumptions, appliedHousehold, cashFlowMode, events, goals]);

  const allGoalEvaluations = useMemo(
    () =>
      evaluateAllGoals(goals, projectionResult.points, START_YEAR, appliedAssumptions.horizonYears),
    [goals, projectionResult.points, appliedAssumptions.horizonYears],
  );

  const activeSelectedYear = useMemo(() => {
    const points = projectionResult.points;
    if (points.some((p) => p.year === selectedYear)) return selectedYear;
    if (points.length === 0) return START_YEAR;
    return points[Math.min(1, points.length - 1)].year;
  }, [projectionResult.points, selectedYear]);

  const outOfHorizonMilestones = useMemo(
    () =>
      getOutOfHorizonMilestones(
        appliedHousehold.members,
        START_YEAR,
        appliedAssumptions.horizonYears,
      ),
    [appliedHousehold.members, appliedAssumptions.horizonYears],
  );

  const recommendedHorizonYears = useMemo(
    () => getHorizonToCoverAllMilestones(appliedHousehold.members, START_YEAR),
    [appliedHousehold.members],
  );

  const hasUnappliedChanges = useMemo(() => {
    const horizonNum = Number(cleanNumericInput(formValues.horizonYears));
    const incomeNum = Number(cleanNumericInput(formValues.annualIncome));
    const spendingNum = Number(cleanNumericInput(formValues.annualSpending));
    const inflationNum = Number(cleanNumericInput(formValues.inflationPercent));
    const returnNum = Number(cleanNumericInput(formValues.annualReturnPercent));

    const isFlat = cashFlowMode === "flat";
    if (
      horizonNum !== appliedAssumptions.horizonYears ||
      (isFlat && incomeNum !== appliedAssumptions.annualIncome) ||
      (isFlat && spendingNum !== appliedAssumptions.annualSpending) ||
      inflationNum !== appliedAssumptions.inflationPercent ||
      returnNum !== appliedAssumptions.annualReturnPercent
    )
      return true;

    const isCouple = formValues.household.isCouple;
    if (isCouple !== appliedHousehold.members.length > 1) return true;

    const primary = appliedHousehold.members[0];
    if (
      formValues.household.primary.name.trim() !== primary.name ||
      Number(cleanNumericInput(formValues.household.primary.birthYear)) !== primary.birthYear ||
      Number(cleanNumericInput(formValues.household.primary.retirementAge)) !==
        primary.retirementAge ||
      Number(cleanNumericInput(formValues.household.primary.planningEndAge)) !==
        primary.planningEndAge
    )
      return true;

    if (isCouple) {
      const partner = appliedHousehold.members[1];
      const partnerForm = formValues.household.partner;
      if (partnerForm === undefined) return true;
      if (
        partnerForm.name.trim() !== partner.name ||
        Number(cleanNumericInput(partnerForm.birthYear)) !== partner.birthYear ||
        Number(cleanNumericInput(partnerForm.retirementAge)) !== partner.retirementAge ||
        Number(cleanNumericInput(partnerForm.planningEndAge)) !== partner.planningEndAge
      )
        return true;
    }

    return false;
  }, [appliedAssumptions, appliedHousehold, cashFlowMode, formValues]);

  const isDefaultAssumptions = useMemo(() => {
    const defaultHousehold = createDefaultHousehold(START_YEAR);
    const primaryDefault = defaultHousehold.members[0];
    const primaryCurrent = appliedHousehold.members[0];

    const householdIsDefault =
      appliedHousehold.members.length === 1 &&
      primaryCurrent.name === primaryDefault.name &&
      primaryCurrent.birthYear === primaryDefault.birthYear &&
      primaryCurrent.retirementAge === primaryDefault.retirementAge &&
      primaryCurrent.planningEndAge === primaryDefault.planningEndAge;

    const eventsAreDefault = cashFlowMode === "flat" && events.length === 0;
    const goalsAreDefault = goals.length === 0;

    return (
      householdIsDefault &&
      eventsAreDefault &&
      goalsAreDefault &&
      appliedAssumptions.annualIncome === DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualIncome &&
      appliedAssumptions.annualSpending ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualSpending &&
      appliedAssumptions.inflationPercent ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.inflationPercent &&
      appliedAssumptions.annualReturnPercent ===
        DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.annualReturnPercent &&
      appliedAssumptions.horizonYears === DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS.horizonYears
    );
  }, [appliedAssumptions, appliedHousehold, cashFlowMode, events, goals]);

  const handleFieldChange =
    (field: keyof Omit<AssumptionFormValues, "household">) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
      if (formErrors[field] !== undefined)
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const handleSetHouseholdMode = (mode: "single" | "couple") => {
    setFormValues((prev) => ({
      ...prev,
      household: {
        ...prev.household,
        isCouple: mode === "couple",
        partner: prev.household.partner ?? toMemberFormValues(createDefaultPartner(START_YEAR)),
      },
    }));
  };

  const handlePrimaryMemberChange =
    (field: keyof HouseholdMemberFormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({
        ...prev,
        household: {
          ...prev.household,
          primary: {
            ...prev.household.primary,
            [field]: value,
          },
        },
      }));
      if (field !== "id" && formErrors.primary?.[field] !== undefined) {
        setFormErrors((prev) => ({
          ...prev,
          primary: {
            ...prev.primary,
            [field]: undefined,
          },
        }));
      }
    };

  const handlePartnerMemberChange =
    (field: keyof HouseholdMemberFormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFormValues((prev) => ({
        ...prev,
        household: {
          ...prev.household,
          partner: prev.household.partner
            ? {
                ...prev.household.partner,
                [field]: value,
              }
            : undefined,
        },
      }));
      if (field !== "id" && formErrors.partner?.[field] !== undefined) {
        setFormErrors((prev) => ({
          ...prev,
          partner: {
            ...prev.partner,
            [field]: undefined,
          },
        }));
      }
    };

  const handleExtendHorizonToMilestones = () => {
    setFormValues((prev) => ({
      ...prev,
      horizonYears: String(recommendedHorizonYears),
    }));
  };

  const saveEvents = (newEvents: ProjectionEvent[], newMode: CashFlowMode = cashFlowMode) => {
    setEvents(newEvents);
    writeLifetimePlanSnapshot(userId, {
      version: STARTER_LIFETIME_PLAN_VERSION,
      planType: "custom",
      baseline: activeBaseline,
      assumptions: appliedAssumptions,
      household: appliedHousehold,
      cashFlowMode: newMode,
      events: newEvents,
      goals,
      updatedAt: new Date().toISOString(),
    });
    setPlanType("custom");
    setIsSavedPlan(true);
  };

  const handleSetCashFlowMode = (newMode: CashFlowMode) => {
    setCashFlowMode(newMode);
    writeLifetimePlanSnapshot(userId, {
      version: STARTER_LIFETIME_PLAN_VERSION,
      planType: "custom",
      baseline: activeBaseline,
      assumptions: appliedAssumptions,
      household: appliedHousehold,
      cashFlowMode: newMode,
      events,
      goals,
      updatedAt: new Date().toISOString(),
    });
    setPlanType("custom");
    setIsSavedPlan(true);
  };

  const handleOpenAddEvent = () => {
    setEditingEvent(null);
    setIsEventDialogOpen(true);
  };

  const handleEditEvent = (eventToEdit: ProjectionEvent) => {
    setEditingEvent(eventToEdit);
    setIsEventDialogOpen(true);
  };

  const handleSaveEvent = (savedEvent: ProjectionEvent) => {
    const existingIndex = events.findIndex((e) => e.id === savedEvent.id);
    const nextEvents =
      existingIndex >= 0
        ? events.map((e, idx) => (idx === existingIndex ? savedEvent : e))
        : [...events, savedEvent];
    saveEvents(nextEvents);
  };

  const handleToggleEvent = (eventId: string) => {
    const nextEvents = events.map((e) => (e.id === eventId ? { ...e, enabled: !e.enabled } : e));
    saveEvents(nextEvents);
  };

  const handleDeleteEvent = (eventId: string) => {
    const nextEvents = events.filter((e) => e.id !== eventId);
    saveEvents(nextEvents);
  };

  const handlePrefillStarterEvents = () => {
    const primaryMember = appliedHousehold.members[0];
    const retirementYear = primaryMember.birthYear + primaryMember.retirementAge;
    const horizonEndYear = START_YEAR + appliedAssumptions.horizonYears;

    const starterEvents: ProjectionEvent[] = [
      {
        id: `event-${Date.now()}-1`,
        name: "Salary",
        type: "income",
        frequency: "recurring",
        memberId: primaryMember.id,
        startYear: START_YEAR + 1,
        endYear: Math.max(START_YEAR + 1, retirementYear),
        amount: appliedAssumptions.annualIncome,
        annualChangePercent: 0,
        enabled: true,
      },
      {
        id: `event-${Date.now()}-2`,
        name: "Living costs",
        type: "spending",
        frequency: "recurring",
        memberId: "household",
        startYear: START_YEAR + 1,
        endYear: horizonEndYear,
        amount: appliedAssumptions.annualSpending,
        annualChangePercent: 0,
        enabled: true,
      },
    ];

    saveEvents(starterEvents);
  };

  const saveGoals = (newGoals: ProjectionGoal[]) => {
    setGoals(newGoals);
    writeLifetimePlanSnapshot(userId, {
      version: STARTER_LIFETIME_PLAN_VERSION,
      planType: "custom",
      baseline: activeBaseline,
      assumptions: appliedAssumptions,
      household: appliedHousehold,
      cashFlowMode,
      events,
      goals: newGoals,
      updatedAt: new Date().toISOString(),
    });
    setPlanType("custom");
    setIsSavedPlan(true);
  };

  const handleOpenAddGoal = () => {
    setEditingGoal(null);
    setIsGoalDialogOpen(true);
  };

  const handleEditGoal = (goalToEdit: ProjectionGoal) => {
    setEditingGoal(goalToEdit);
    setIsGoalDialogOpen(true);
  };

  const handleSaveGoal = (savedGoal: ProjectionGoal) => {
    const existingIndex = goals.findIndex((g) => g.id === savedGoal.id);
    const nextGoals =
      existingIndex >= 0
        ? goals.map((g, idx) => (idx === existingIndex ? savedGoal : g))
        : [...goals, savedGoal];
    saveGoals(nextGoals);
  };

  const handleToggleGoal = (goalId: string) => {
    const nextGoals = goals.map((g) => (g.id === goalId ? { ...g, enabled: !g.enabled } : g));
    saveGoals(nextGoals);
  };

  const handleDeleteGoal = (goalId: string) => {
    const nextGoals = goals.filter((g) => g.id !== goalId);
    saveGoals(nextGoals);
  };

  const handlePrefillStarterGoals = () => {
    const primaryMember = appliedHousehold.members[0];
    const retirementYear = primaryMember.birthYear + primaryMember.retirementAge;

    const starterGoals: ProjectionGoal[] = [
      {
        id: `goal-${Date.now()}-1`,
        name: "Retirement nest egg",
        type: "target_balance",
        targetYear: retirementYear,
        targetAmount: 1_000_000,
        memberId: primaryMember.id,
        isFlexible: true,
        shortfallExperiment: { enabled: false, strategy: "none" },
        enabled: true,
      },
      {
        id: `goal-${Date.now()}-2`,
        name: "College fund",
        type: "dated_spending",
        targetYear: START_YEAR + 10,
        targetAmount: 80_000,
        memberId: "household",
        isFlexible: true,
        shortfallExperiment: { enabled: false, strategy: "none" },
        enabled: true,
      },
    ];

    saveGoals(starterGoals);
  };

  const handleApplyShortfallExperiment = (
    goalId: string,
    strategy: "none" | "reduce" | "defer",
    params?: { reducedAmount?: number; deferredYears?: number },
  ) => {
    const nextGoals = goals.map((g) => {
      if (g.id !== goalId) return g;
      return {
        ...g,
        shortfallExperiment: {
          enabled: strategy !== "none",
          strategy,
          reducedAmount: params?.reducedAmount ?? g.shortfallExperiment.reducedAmount,
          deferredYears: params?.deferredYears ?? g.shortfallExperiment.deferredYears ?? 2,
        },
      };
    });
    saveGoals(nextGoals);
  };

  const handleInspectYear = (year: number) => {
    setSelectedYear(year);
  };

  const handleFormSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const validation = validateAssumptionForm(formValues, START_YEAR);
    if (validation.parsedAssumptions !== undefined && validation.parsedHousehold !== undefined) {
      setFormErrors({});
      setFormValues(toFormValues(validation.parsedAssumptions, validation.parsedHousehold));
      setAppliedAssumptions(validation.parsedAssumptions);
      setAppliedHousehold(validation.parsedHousehold);
      writeLifetimePlanSnapshot(userId, {
        version: STARTER_LIFETIME_PLAN_VERSION,
        planType: "custom",
        baseline: activeBaseline,
        assumptions: validation.parsedAssumptions,
        household: validation.parsedHousehold,
        cashFlowMode,
        events,
        goals,
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
    const starter = resetLifetimePlanToStarter(userId, startingBalance, accounts, START_YEAR);
    const starterHousehold = starter.household ?? createDefaultHousehold(START_YEAR);
    setFormErrors({});
    setFormValues(toFormValues(starter.assumptions, starterHousehold));
    setAppliedAssumptions(starter.assumptions);
    setAppliedHousehold(starterHousehold);
    setActiveBaseline(starter.baseline);
    setCashFlowMode(starter.cashFlowMode ?? "flat");
    setEvents(starter.events ?? []);
    setGoals(starter.goals ?? []);
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
  const year1Point = points[1];
  const year1Income = year1Point.annualIncome ?? 0;
  const year1Spending = year1Point.annualSpending ?? 0;

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
            className="space-y-5 rounded-xl bg-container p-5 shadow-border-xs lg:col-span-3"
            noValidate
            onSubmit={handleFormSubmit}
          >
            {/* Household Planning Horizon */}
            <div className="space-y-4 rounded-xl border border-secondary bg-container-inset/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-primary">Household planning horizon</h3>
                  <p className="text-xs text-secondary">
                    Track milestones, retirement timing, and longevity for each person.
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-secondary bg-container p-0.5 text-xs font-medium">
                  <button
                    aria-pressed={!formValues.household.isCouple}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      !formValues.household.isCouple
                        ? "bg-container-inset font-medium text-primary shadow-xs"
                        : "text-secondary hover:text-primary"
                    }`}
                    onClick={() => {
                      handleSetHouseholdMode("single");
                    }}
                    type="button"
                  >
                    Single
                  </button>
                  <button
                    aria-pressed={formValues.household.isCouple}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      formValues.household.isCouple
                        ? "bg-container-inset font-medium text-primary shadow-xs"
                        : "text-secondary hover:text-primary"
                    }`}
                    onClick={() => {
                      handleSetHouseholdMode("couple");
                    }}
                    type="button"
                  >
                    Couple
                  </button>
                </div>
              </div>

              {/* Primary Member */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-secondary">
                    Primary member
                  </span>
                  <span className="text-xs text-secondary">
                    Age{" "}
                    {START_YEAR -
                      (Number(cleanNumericInput(formValues.household.primary.birthYear)) || 0)}{" "}
                    in {START_YEAR}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    error={formErrors.primary?.name}
                    id="member-primary-name"
                    label="Name"
                    name="primaryName"
                    onChange={handlePrimaryMemberChange("name")}
                    required
                    value={formValues.household.primary.name}
                  />
                  <FormField
                    actions={
                      <span className="text-xs text-secondary">
                        Age{" "}
                        {START_YEAR -
                          (Number(cleanNumericInput(formValues.household.primary.birthYear)) || 0)}
                      </span>
                    }
                    error={formErrors.primary?.birthYear}
                    id="member-primary-birth-year"
                    inputMode="numeric"
                    label="Birth year"
                    name="primaryBirthYear"
                    onChange={handlePrimaryMemberChange("birthYear")}
                    required
                    value={formValues.household.primary.birthYear}
                  />
                  <FormField
                    actions={
                      <span className="text-xs text-secondary">
                        Year{" "}
                        {(Number(cleanNumericInput(formValues.household.primary.birthYear)) || 0) +
                          (Number(cleanNumericInput(formValues.household.primary.retirementAge)) ||
                            0)}
                      </span>
                    }
                    error={formErrors.primary?.retirementAge}
                    id="member-primary-retirement-age"
                    inputMode="numeric"
                    label="Retirement age"
                    name="primaryRetirementAge"
                    onChange={handlePrimaryMemberChange("retirementAge")}
                    required
                    value={formValues.household.primary.retirementAge}
                  />
                  <FormField
                    actions={
                      <span className="text-xs text-secondary">
                        Year{" "}
                        {(Number(cleanNumericInput(formValues.household.primary.birthYear)) || 0) +
                          (Number(cleanNumericInput(formValues.household.primary.planningEndAge)) ||
                            0)}
                      </span>
                    }
                    description="Longevity assumption"
                    error={formErrors.primary?.planningEndAge}
                    id="member-primary-end-age"
                    inputMode="numeric"
                    label="Planning end age"
                    name="primaryPlanningEndAge"
                    onChange={handlePrimaryMemberChange("planningEndAge")}
                    required
                    value={formValues.household.primary.planningEndAge}
                  />
                </div>
              </div>

              {/* Partner Member */}
              {formValues.household.isCouple && formValues.household.partner ? (
                <div className="space-y-2 border-t border-secondary pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-secondary">
                      Partner
                    </span>
                    <span className="text-xs text-secondary">
                      Age{" "}
                      {START_YEAR -
                        (Number(cleanNumericInput(formValues.household.partner.birthYear)) ||
                          0)}{" "}
                      in {START_YEAR}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      error={formErrors.partner?.name}
                      id="member-partner-name"
                      label="Name"
                      name="partnerName"
                      onChange={handlePartnerMemberChange("name")}
                      required
                      value={formValues.household.partner.name}
                    />
                    <FormField
                      actions={
                        <span className="text-xs text-secondary">
                          Age{" "}
                          {START_YEAR -
                            (Number(cleanNumericInput(formValues.household.partner.birthYear)) ||
                              0)}
                        </span>
                      }
                      error={formErrors.partner?.birthYear}
                      id="member-partner-birth-year"
                      inputMode="numeric"
                      label="Birth year"
                      name="partnerBirthYear"
                      onChange={handlePartnerMemberChange("birthYear")}
                      required
                      value={formValues.household.partner.birthYear}
                    />
                    <FormField
                      actions={
                        <span className="text-xs text-secondary">
                          Year{" "}
                          {(Number(cleanNumericInput(formValues.household.partner.birthYear)) ||
                            0) +
                            (Number(
                              cleanNumericInput(formValues.household.partner.retirementAge),
                            ) || 0)}
                        </span>
                      }
                      error={formErrors.partner?.retirementAge}
                      id="member-partner-retirement-age"
                      inputMode="numeric"
                      label="Retirement age"
                      name="partnerRetirementAge"
                      onChange={handlePartnerMemberChange("retirementAge")}
                      required
                      value={formValues.household.partner.retirementAge}
                    />
                    <FormField
                      actions={
                        <span className="text-xs text-secondary">
                          Year{" "}
                          {(Number(cleanNumericInput(formValues.household.partner.birthYear)) ||
                            0) +
                            (Number(
                              cleanNumericInput(formValues.household.partner.planningEndAge),
                            ) || 0)}
                        </span>
                      }
                      description="Longevity assumption"
                      error={formErrors.partner?.planningEndAge}
                      id="member-partner-end-age"
                      inputMode="numeric"
                      label="Planning end age"
                      name="partnerPlanningEndAge"
                      onChange={handlePartnerMemberChange("planningEndAge")}
                      required
                      value={formValues.household.partner.planningEndAge}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Cash flow model & schedule */}
            <div className="space-y-4 rounded-xl border border-secondary bg-container-inset/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-primary">Cash flow schedule</h3>
                  <p className="text-xs text-secondary">
                    Simulate with simple flat amounts or detailed scheduled life events.
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-secondary bg-container p-0.5 text-xs font-medium">
                  <button
                    aria-pressed={cashFlowMode === "flat"}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      cashFlowMode === "flat"
                        ? "bg-container-inset font-medium text-primary shadow-xs"
                        : "text-secondary hover:text-primary"
                    }`}
                    onClick={() => {
                      handleSetCashFlowMode("flat");
                    }}
                    type="button"
                  >
                    Flat annual amounts
                  </button>
                  <button
                    aria-pressed={cashFlowMode === "events"}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      cashFlowMode === "events"
                        ? "bg-container-inset font-medium text-primary shadow-xs"
                        : "text-secondary hover:text-primary"
                    }`}
                    onClick={() => {
                      handleSetCashFlowMode("events");
                    }}
                    type="button"
                  >
                    Scheduled life events
                  </button>
                </div>
              </div>

              {cashFlowMode === "flat" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-secondary">
                        Scheduled life events ({events.length})
                      </span>
                      <p className="text-xs text-secondary">
                        Timing, amounts, and member assignments drive projected cash flow.
                      </p>
                    </div>
                    {events.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Button
                          id="add-event-button"
                          onClick={handleOpenAddEvent}
                          size="sm"
                          type="button"
                          variant="primary"
                        >
                          <Icon className="mr-1.5" name="plus" size="sm" />
                          Add event
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-secondary bg-container p-3 sm:grid-cols-2 text-xs">
                    <div>
                      <span className="text-secondary">Year 1 income (active events):</span>
                      <span className="ml-2 font-semibold tabular-nums text-success">
                        +{money.format(year1Income)}
                      </span>
                    </div>
                    <div>
                      <span className="text-secondary">Year 1 spending (active events):</span>
                      <span className="ml-2 font-semibold tabular-nums text-destructive">
                        −{money.format(year1Spending)}
                      </span>
                    </div>
                  </div>

                  {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-secondary bg-container p-6 text-center text-xs text-secondary">
                      <Icon className="mb-2 text-secondary" name="calendar" size="md" />
                      <p className="font-medium text-primary">No events scheduled yet</p>
                      <p className="mt-1 max-w-sm">
                        Schedule recurring income, retirement pensions, living costs, or one-time
                        expenses to drive your projection.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          onClick={handleOpenAddEvent}
                          size="sm"
                          type="button"
                          variant="primary"
                        >
                          <Icon className="mr-1.5" name="plus" size="sm" />
                          Add event
                        </Button>
                        <Button
                          onClick={handlePrefillStarterEvents}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Pre-fill starter events
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-secondary bg-container">
                      <table
                        className="w-full min-w-160 text-xs"
                        data-testid="scheduled-events-table"
                      >
                        <caption className="sr-only">Scheduled life events</caption>
                        <thead className="bg-container-inset">
                          <tr>
                            <th
                              className="px-3 py-2 text-left font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Status
                            </th>
                            <th
                              className="px-3 py-2 text-left font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Event & Member
                            </th>
                            <th
                              className="px-3 py-2 text-left font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Type
                            </th>
                            <th
                              className="px-3 py-2 text-left font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Active timing
                            </th>
                            <th
                              className="px-3 py-2 text-right font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Base amount
                            </th>
                            <th
                              className="px-3 py-2 text-right font-medium uppercase tracking-wide text-secondary"
                              scope="col"
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tertiary">
                          {events.map((event) => {
                            const memberName =
                              event.memberId === "household"
                                ? "Household (Shared)"
                                : (appliedHousehold.members.find((m) => m.id === event.memberId)
                                    ?.name ?? "Member");

                            const timingText =
                              event.frequency === "one_time"
                                ? `${event.startYear} (One-time)`
                                : `${event.startYear} – ${event.endYear} (${
                                    event.endYear - event.startYear + 1
                                  } yrs)`;

                            return (
                              <tr
                                className={`transition-colors hover:bg-surface-hover ${
                                  !event.enabled ? "opacity-60" : ""
                                }`}
                                key={event.id}
                              >
                                <td className="px-3 py-2.5">
                                  <button
                                    aria-label={
                                      event.enabled
                                        ? `Disable ${event.name}`
                                        : `Enable ${event.name}`
                                    }
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                      event.enabled
                                        ? "bg-success/15 text-success hover:bg-success/25"
                                        : "bg-container-inset text-secondary hover:text-primary"
                                    }`}
                                    onClick={() => {
                                      handleToggleEvent(event.id);
                                    }}
                                    type="button"
                                  >
                                    <span
                                      className={`size-1.5 rounded-full ${
                                        event.enabled ? "bg-success" : "bg-container-inset"
                                      }`}
                                    />
                                    {event.enabled ? "Enabled" : "Disabled"}
                                  </button>
                                </td>
                                <th
                                  aria-label={`${event.name} (${memberName})`}
                                  className="px-3 py-2.5 text-left font-medium text-primary"
                                  scope="row"
                                >
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-primary">{event.name}</span>
                                    <span className="text-[11px] text-secondary">{memberName}</span>
                                  </div>
                                </th>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                      event.type === "income"
                                        ? "bg-success/15 text-success"
                                        : "bg-destructive/15 text-destructive"
                                    }`}
                                  >
                                    {event.type === "income" ? "Income" : "Spending"}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-secondary">{timingText}</td>
                                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-primary">
                                  <div>
                                    {money.format(event.amount)}
                                    {event.frequency === "recurring" ? " / yr" : ""}
                                  </div>
                                  {event.annualChangePercent !== 0 ? (
                                    <div className="text-[10px] text-secondary">
                                      {event.annualChangePercent > 0 ? "+" : ""}
                                      {event.annualChangePercent}% / yr
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      aria-label={`Edit ${event.name}`}
                                      className="rounded-md p-1 text-secondary hover:bg-container-inset hover:text-primary"
                                      onClick={() => {
                                        handleEditEvent(event);
                                      }}
                                      type="button"
                                    >
                                      <Icon name="pencil" size="sm" />
                                    </button>
                                    <button
                                      aria-label={`Delete ${event.name}`}
                                      className="rounded-md p-1 text-secondary hover:bg-container-inset hover:text-destructive"
                                      onClick={() => {
                                        handleDeleteEvent(event.id);
                                      }}
                                      type="button"
                                    >
                                      <Icon name="trash-2" size="sm" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Goals and milestones section */}
            <div
              className="space-y-4 rounded-xl border border-secondary bg-container-inset/40 p-4"
              data-testid="goals-milestones-section"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-primary">
                      Goals and milestones ({goals.length})
                    </h3>
                  </div>
                  <p className="text-xs text-secondary">
                    Track target-balance milestones and dated spending goals, and experiment with
                    shortfalls.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    id="add-goal-button"
                    onClick={handleOpenAddGoal}
                    size="sm"
                    type="button"
                    variant="primary"
                  >
                    <Icon className="mr-1.5" name="plus" size="sm" />
                    Add goal
                  </Button>
                </div>
              </div>

              {goals.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-secondary bg-container p-2.5">
                    <span className="font-medium text-secondary">Funded</span>
                    <div className="mt-0.5 text-base font-semibold text-success">
                      {
                        allGoalEvaluations.filter((e) => e.goal.enabled && e.status === "funded")
                          .length
                      }
                    </div>
                  </div>
                  <div className="rounded-lg border border-secondary bg-container p-2.5">
                    <span className="font-medium text-secondary">Partially funded</span>
                    <div className="mt-0.5 text-base font-semibold text-warning">
                      {
                        allGoalEvaluations.filter(
                          (e) => e.goal.enabled && e.status === "partially_funded",
                        ).length
                      }
                    </div>
                  </div>
                  <div className="rounded-lg border border-secondary bg-container p-2.5">
                    <span className="font-medium text-secondary">Missed</span>
                    <div className="mt-0.5 text-base font-semibold text-destructive">
                      {
                        allGoalEvaluations.filter((e) => e.goal.enabled && e.status === "missed")
                          .length
                      }
                    </div>
                  </div>
                  <div className="rounded-lg border border-secondary bg-container p-2.5">
                    <span className="font-medium text-secondary">Not yet evaluable</span>
                    <div className="mt-0.5 text-base font-semibold text-secondary">
                      {
                        allGoalEvaluations.filter(
                          (e) => e.goal.enabled && e.status === "not_yet_evaluable",
                        ).length
                      }
                    </div>
                  </div>
                </div>
              ) : null}

              {goals.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-secondary bg-container p-6 text-center text-xs text-secondary">
                  <Icon className="mb-2 text-secondary" name="target" size="md" />
                  <p className="font-medium text-primary">No goals or milestones added yet</p>
                  <p className="mt-1 max-w-sm">
                    Add target-balance milestones (e.g. $1M nest egg at retirement) or dated
                    spending goals (e.g. college funding) to see if they are funded.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button onClick={handleOpenAddGoal} size="sm" type="button" variant="primary">
                      <Icon className="mr-1.5" name="plus" size="sm" />
                      Add goal
                    </Button>
                    <Button
                      onClick={handlePrefillStarterGoals}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Pre-fill starter goals
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3" data-testid="goals-list">
                  {allGoalEvaluations.map((ev) => {
                    const goal = ev.goal;
                    const memberName =
                      goal.memberId === "household"
                        ? "Household (Shared)"
                        : (appliedHousehold.members.find((m) => m.id === goal.memberId)?.name ??
                          "Member");

                    let statusBadgeClass = "bg-container-inset text-secondary";
                    if (ev.status === "funded") statusBadgeClass = "bg-success/15 text-success";
                    else if (ev.status === "partially_funded")
                      statusBadgeClass = "bg-warning/15 text-warning";
                    else if (ev.status === "missed")
                      statusBadgeClass = "bg-destructive/15 text-destructive";

                    const hasShortfall = ev.status === "partially_funded" || ev.status === "missed";

                    return (
                      <div
                        className={`rounded-lg border border-secondary bg-container p-3.5 text-xs transition-colors ${
                          !goal.enabled ? "opacity-60" : ""
                        }`}
                        data-testid={`goal-card-${goal.id}`}
                        key={goal.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-secondary pb-2.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-primary">
                                {goal.name}
                              </span>
                              <span className="text-[11px] text-secondary">({memberName})</span>
                              <span className="rounded-full bg-container-inset px-2 py-0.5 text-[10px] font-medium text-secondary">
                                {goal.type === "target_balance"
                                  ? "Target balance milestone"
                                  : "Dated spending goal"}
                              </span>
                              {goal.isFlexible ? (
                                <span className="rounded-full bg-container-inset px-1.5 py-0.5 text-[10px] text-secondary">
                                  Flexible
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-secondary">
                              <span>
                                Target year:{" "}
                                <strong className="font-medium text-primary">
                                  {goal.targetYear}
                                </strong>
                                {ev.isExperimentActive &&
                                goal.shortfallExperiment.strategy === "defer" ? (
                                  <span className="ml-1 font-medium text-warning">
                                    → Deferred to {ev.effectiveYear} (+
                                    {goal.shortfallExperiment.deferredYears} yrs)
                                  </span>
                                ) : null}
                              </span>
                              <span>•</span>
                              <span>
                                Target amount:{" "}
                                <strong className="font-medium text-primary">
                                  {money.format(goal.targetAmount)}
                                </strong>
                                {ev.isExperimentActive &&
                                goal.shortfallExperiment.strategy === "reduce" ? (
                                  <span className="ml-1 font-medium text-warning">
                                    → Reduced to {money.format(ev.effectiveAmount)}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass}`}
                            >
                              {ev.statusLabel}
                              {ev.status === "partially_funded" ? ` (${ev.fundedPercentage}%)` : ""}
                            </span>
                            <button
                              aria-label={
                                goal.enabled ? `Disable ${goal.name}` : `Enable ${goal.name}`
                              }
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                goal.enabled
                                  ? "bg-success/15 text-success hover:bg-success/25"
                                  : "bg-container-inset text-secondary hover:text-primary"
                              }`}
                              onClick={() => {
                                handleToggleGoal(goal.id);
                              }}
                              type="button"
                            >
                              {goal.enabled ? "Enabled" : "Disabled"}
                            </button>
                            <button
                              aria-label={`Edit ${goal.name}`}
                              className="rounded-md p-1 text-secondary hover:bg-container-inset hover:text-primary"
                              onClick={() => {
                                handleEditGoal(goal);
                              }}
                              type="button"
                            >
                              <Icon name="pencil" size="sm" />
                            </button>
                            <button
                              aria-label={`Delete ${goal.name}`}
                              className="rounded-md p-1 text-secondary hover:bg-container-inset hover:text-destructive"
                              onClick={() => {
                                handleDeleteGoal(goal.id);
                              }}
                              type="button"
                            >
                              <Icon name="trash-2" size="sm" />
                            </button>
                          </div>
                        </div>

                        {/* Determining explanation & link */}
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <p className="text-secondary">{ev.explanation}</p>
                            <p className="text-[11px] font-medium text-secondary">
                              Determined by: {ev.determiningFlowsSummary}
                            </p>
                          </div>
                          {ev.status !== "not_yet_evaluable" ? (
                            <button
                              className="inline-flex items-center gap-1 rounded-lg border border-secondary bg-container-inset px-2.5 py-1 text-xs font-medium text-primary hover:border-primary hover:bg-surface-hover"
                              data-testid={`inspect-year-${goal.id}`}
                              onClick={() => {
                                handleInspectYear(ev.effectiveYear);
                              }}
                              type="button"
                            >
                              <Icon name="search" size="sm" />
                              Inspect year {ev.effectiveYear}
                            </button>
                          ) : null}
                        </div>

                        {/* Explicit shortfall experiment controls for flexible goals */}
                        {goal.isFlexible && (hasShortfall || ev.isExperimentActive) ? (
                          <div
                            className="mt-3 space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
                            data-testid={`shortfall-experiment-${goal.id}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                <Icon
                                  className="text-warning"
                                  name="sliders-horizontal"
                                  size="sm"
                                />
                                Shortfall experiment
                              </span>
                              {ev.isExperimentActive ? (
                                <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
                                  Experiment active
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-secondary">
                              Simulate adjustments to resolve the shortfall for this flexible goal.
                            </p>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  !ev.isExperimentActive
                                    ? "border-primary bg-container font-semibold text-primary shadow-xs"
                                    : "border-secondary text-secondary hover:text-primary"
                                }`}
                                onClick={() => {
                                  handleApplyShortfallExperiment(goal.id, "none");
                                }}
                                type="button"
                              >
                                Original target
                              </button>

                              <button
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  ev.isExperimentActive &&
                                  goal.shortfallExperiment.strategy === "defer"
                                    ? "border-primary bg-container font-semibold text-primary shadow-xs"
                                    : "border-secondary text-secondary hover:text-primary"
                                }`}
                                onClick={() => {
                                  handleApplyShortfallExperiment(goal.id, "defer", {
                                    deferredYears: 2,
                                  });
                                }}
                                type="button"
                              >
                                Defer +2 years ({goal.targetYear + 2})
                              </button>

                              <button
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  ev.isExperimentActive &&
                                  goal.shortfallExperiment.strategy === "reduce"
                                    ? "border-primary bg-container font-semibold text-primary shadow-xs"
                                    : "border-secondary text-secondary hover:text-primary"
                                }`}
                                onClick={() => {
                                  const reduced =
                                    ev.fundedAmount > 0
                                      ? ev.fundedAmount
                                      : Math.round(goal.targetAmount * 0.7);
                                  handleApplyShortfallExperiment(goal.id, "reduce", {
                                    reducedAmount: reduced,
                                  });
                                }}
                                type="button"
                              >
                                Reduce target amount (
                                {money.format(
                                  ev.fundedAmount > 0
                                    ? ev.fundedAmount
                                    : Math.round(goal.targetAmount * 0.7),
                                )}
                                )
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Financial assumptions inputs */}
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

            {/* Out-of-horizon Milestones Notice */}
            {outOfHorizonMilestones.length > 0 ? (
              <div
                aria-label="Milestones outside projection horizon"
                className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 shrink-0 text-warning" name="clock" size="sm" />
                  <div className="space-y-1">
                    <p className="font-semibold text-primary">
                      Milestones outside the {appliedAssumptions.horizonYears}-year projection
                      horizon:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4 text-secondary">
                      {outOfHorizonMilestones.map((m) => (
                        <li key={`${m.memberId}-${m.type}-${m.year}`}>{m.description}</li>
                      ))}
                    </ul>
                    <div className="pt-1">
                      <button
                        className="font-medium text-link hover:underline"
                        onClick={handleExtendHorizonToMilestones}
                        type="button"
                      >
                        Extend horizon to {recommendedHorizonYears} years to cover all milestones
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

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
            <table className="w-full min-w-180" data-testid="projection-results-table">
              <caption className="sr-only">Lifetime net worth projection by year</caption>
              <thead className="bg-container-inset">
                <tr>
                  <ProjectionHeading align="left">Year</ProjectionHeading>
                  <ProjectionHeading align="left">Age(s)</ProjectionHeading>
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
                      <td className="px-4 py-3 text-left text-sm tabular-nums text-secondary">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>
                            {point.memberStates && point.memberStates.length > 0
                              ? point.memberStates.map((m) => `${m.age}`).join(" / ")
                              : "—"}
                          </span>
                          {point.memberStates?.some((m) => m.isRetirementYear) === true ? (
                            <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                              Retirement
                            </span>
                          ) : null}
                          {point.memberStates?.some((m) => m.isBeyondPlanningEndAge) === true ? (
                            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                              Post-horizon
                            </span>
                          ) : null}
                          {point.goalEvaluations && point.goalEvaluations.length > 0 ? (
                            <span className="rounded-full bg-container-inset px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {point.goalEvaluations.length === 1
                                ? point.goalEvaluations[0].goal.name
                                : `${point.goalEvaluations.length} goals`}
                            </span>
                          ) : null}
                        </div>
                      </td>
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

      <ProjectionEventDialog
        household={appliedHousehold}
        initialEvent={editingEvent}
        isOpen={isEventDialogOpen}
        onClose={() => {
          setIsEventDialogOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
        startYear={START_YEAR}
      />

      <ProjectionGoalDialog
        household={appliedHousehold}
        initialGoal={editingGoal}
        isOpen={isGoalDialogOpen}
        onClose={() => {
          setIsGoalDialogOpen(false);
          setEditingGoal(null);
        }}
        onSave={handleSaveGoal}
        startYear={START_YEAR}
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
