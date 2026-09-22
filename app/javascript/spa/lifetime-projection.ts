import { z } from "zod";

const ProjectionAmountValueSchema = z.number();
const NonnegativeProjectionAmountValueSchema = z.number().nonnegative();
const PercentagePointsValueSchema = z.number().gt(-100);
const HorizonYearsValueSchema = z.number().int().min(1).max(100);
const CalendarYearValueSchema = z.number().int().min(1);

const ProjectionAmountSchema = ProjectionAmountValueSchema.brand<"ProjectionAmount">();
const NonnegativeProjectionAmountSchema =
  NonnegativeProjectionAmountValueSchema.brand<"ProjectionAmount">();
const PercentagePointsSchema = PercentagePointsValueSchema.brand<"PercentagePoints">();
const AnnualRateSchema = z.number().gt(-1).brand<"AnnualRate">();
const HorizonYearsSchema = HorizonYearsValueSchema.brand<"HorizonYears">();
const CalendarYearSchema = CalendarYearValueSchema.brand<"CalendarYear">();

export const HouseholdMemberSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  birthYear: z.number().int().min(1900).max(2100),
  retirementAge: z.number().int().min(18).max(120),
  planningEndAge: z.number().int().min(18).max(120),
});

export const HouseholdSchema = z.object({
  members: z.array(HouseholdMemberSchema).min(1).max(2),
});

export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;
export type Household = z.infer<typeof HouseholdSchema>;

export const ProjectionEventSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  type: z.enum(["income", "spending"]),
  memberId: z.string(),
  frequency: z.enum(["recurring", "one_time"]),
  startYear: z.number().int().min(1900).max(2150),
  endYear: z.number().int().min(1900).max(2150),
  amount: z.number().nonnegative(),
  annualChangePercent: z.number().min(-100).max(100).default(0),
  enabled: z.boolean().default(true),
});

export type ProjectionEvent = z.infer<typeof ProjectionEventSchema>;
export type CashFlowMode = "flat" | "events";

export const ShortfallExperimentSchema = z.object({
  enabled: z.boolean().default(false),
  strategy: z.enum(["none", "reduce", "defer"]).default("none"),
  reducedAmount: z.number().nonnegative().optional(),
  deferredYears: z.number().int().min(0).max(50).optional(),
});

export const ProjectionGoalSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  type: z.enum(["target_balance", "dated_spending"]),
  targetYear: z.number().int().min(1900).max(2150),
  targetAmount: z.number().nonnegative(),
  memberId: z.string().default("household"),
  isFlexible: z.boolean().default(false),
  shortfallExperiment: ShortfallExperimentSchema.default({ enabled: false, strategy: "none" }),
  enabled: z.boolean().default(true),
});

export type ProjectionGoal = z.infer<typeof ProjectionGoalSchema>;
export type ShortfallExperiment = z.infer<typeof ShortfallExperimentSchema>;
export type GoalOutcomeStatus = "funded" | "partially_funded" | "missed" | "not_yet_evaluable";

export type GoalEvaluation = {
  goalId: string;
  goal: ProjectionGoal;
  status: GoalOutcomeStatus;
  statusLabel: string;
  effectiveYear: number;
  effectiveAmount: number;
  targetAmount: number;
  originalYear: number;
  fundedAmount: number;
  shortfallAmount: number;
  fundedPercentage: number;
  isExperimentActive: boolean;
  explanation: string;
  determiningFlowsSummary: string;
  projectedNetWorthAtYear?: number;
};

export type EventYearStatus = {
  eventId: string;
  name: string;
  type: "income" | "spending";
  memberId: string;
  frequency: "recurring" | "one_time";
  startYear: number;
  endYear: number;
  amount: number;
  annualChangePercent: number;
  isActive: boolean;
  isFirstYear: boolean;
  isLastYear: boolean;
  adjustedAmount: number;
  baseAmount: number;
  reason: string;
};

export type MemberLifeStage = "working" | "retirement_year" | "retired" | "post_horizon";

export type MemberYearState = {
  memberId: string;
  name: string;
  age: number;
  birthYear: number;
  retirementAge: number;
  planningEndAge: number;
  isRetired: boolean;
  isRetirementYear: boolean;
  isBeyondPlanningEndAge: boolean;
  lifeStage: MemberLifeStage;
};

export type OutOfHorizonMilestone = {
  memberId: string;
  memberName: string;
  type: "retirement" | "planningEndAge";
  year: number;
  age: number;
  yearsBeyondHorizon: number;
  description: string;
};

export function createDefaultHousehold(startYear = new Date().getFullYear()): Household {
  return {
    members: [
      {
        id: "primary",
        name: "You",
        birthYear: startYear - 35,
        retirementAge: 65,
        planningEndAge: 85,
      },
    ],
  };
}

export function createDefaultPartner(startYear = new Date().getFullYear()): HouseholdMember {
  return {
    id: "partner",
    name: "Partner",
    birthYear: startYear - 33,
    retirementAge: 67,
    planningEndAge: 90,
  };
}

export function calculateMemberYearStates(
  members: HouseholdMember[],
  year: number,
): MemberYearState[] {
  return members.map((member) => {
    const age = year - member.birthYear;
    const isRetired = age >= member.retirementAge;
    const isRetirementYear = age === member.retirementAge;
    const isBeyondPlanningEndAge = age > member.planningEndAge;

    let lifeStage: MemberLifeStage = "working";
    if (isBeyondPlanningEndAge) lifeStage = "post_horizon";
    else if (isRetirementYear) lifeStage = "retirement_year";
    else if (isRetired) lifeStage = "retired";

    return {
      memberId: member.id,
      name: member.name,
      age,
      birthYear: member.birthYear,
      retirementAge: member.retirementAge,
      planningEndAge: member.planningEndAge,
      isRetired,
      isRetirementYear,
      isBeyondPlanningEndAge,
      lifeStage,
    };
  });
}

export function calculateEventYearStatuses(
  events: ProjectionEvent[],
  currentYear: number,
  startYear: number,
  inflationRate: number,
): EventYearStatus[] {
  const yearOffset = currentYear - startYear;
  const inflationFactor = yearOffset > 0 ? (1 + inflationRate) ** (yearOffset - 1) : 1;

  return events.map((event) => {
    const isWithinYears = currentYear >= event.startYear && currentYear <= event.endYear;
    const isActive = event.enabled && isWithinYears;
    const isFirstYear =
      currentYear === event.startYear ||
      (currentYear === startYear + 1 && event.startYear <= startYear);
    const isLastYear = currentYear === event.endYear;

    let reason = "Active";
    if (!event.enabled) reason = "Disabled";
    else if (currentYear < event.startYear) reason = `Starts in ${event.startYear}`;
    else if (currentYear > event.endYear) reason = `Ended in ${event.endYear}`;

    let baseAmount = 0;
    let adjustedAmount = 0;

    if (isActive) {
      const yearsActive = currentYear - event.startYear;
      const growthFactor =
        event.annualChangePercent !== 0 ? (1 + event.annualChangePercent / 100) ** yearsActive : 1;
      baseAmount = event.amount * growthFactor;
      adjustedAmount = baseAmount * inflationFactor;
    }

    return {
      eventId: event.id,
      name: event.name,
      type: event.type,
      memberId: event.memberId,
      frequency: event.frequency,
      startYear: event.startYear,
      endYear: event.endYear,
      amount: event.amount,
      annualChangePercent: event.annualChangePercent,
      isActive,
      isFirstYear,
      isLastYear,
      adjustedAmount,
      baseAmount,
      reason,
    };
  });
}

export function getOutOfHorizonMilestones(
  members: HouseholdMember[],
  startYear: number,
  horizonYears: number,
): OutOfHorizonMilestone[] {
  const horizonEndYear = startYear + horizonYears;
  const milestones: OutOfHorizonMilestone[] = [];

  for (const member of members) {
    const retirementYear = member.birthYear + member.retirementAge;
    if (retirementYear > horizonEndYear) {
      const yearsBeyond = retirementYear - horizonEndYear;
      milestones.push({
        memberId: member.id,
        memberName: member.name,
        type: "retirement",
        year: retirementYear,
        age: member.retirementAge,
        yearsBeyondHorizon: yearsBeyond,
        description: `${member.name} reaches retirement age (${member.retirementAge}) in ${retirementYear} (${yearsBeyond} ${yearsBeyond === 1 ? "year" : "years"} beyond the ${horizonYears}-year horizon).`,
      });
    }

    const planningEndYear = member.birthYear + member.planningEndAge;
    if (planningEndYear > horizonEndYear) {
      const yearsBeyond = planningEndYear - horizonEndYear;
      milestones.push({
        memberId: member.id,
        memberName: member.name,
        type: "planningEndAge",
        year: planningEndYear,
        age: member.planningEndAge,
        yearsBeyondHorizon: yearsBeyond,
        description: `${member.name} reaches planning end age (${member.planningEndAge}) in ${planningEndYear} (${yearsBeyond} ${yearsBeyond === 1 ? "year" : "years"} beyond the ${horizonYears}-year horizon).`,
      });
    }
  }

  return milestones.toSorted((a, b) => a.year - b.year);
}

export function getHorizonToCoverAllMilestones(
  members: HouseholdMember[],
  startYear: number,
): number {
  if (members.length === 0) return 30;
  const maxEndYear = Math.max(...members.map((m) => m.birthYear + m.planningEndAge));
  const diff = maxEndYear - startYear;
  return Math.min(100, Math.max(1, diff));
}

export const LifetimeProjectionInputsSchema = z.object({
  startingBalance: ProjectionAmountSchema,
  annualIncome: NonnegativeProjectionAmountSchema,
  annualSpending: NonnegativeProjectionAmountSchema,
  inflationRate: AnnualRateSchema,
  annualReturnRate: AnnualRateSchema,
  horizonYears: HorizonYearsSchema,
  startYear: CalendarYearSchema,
  household: z.optional(HouseholdSchema),
  cashFlowMode: z.optional(z.enum(["flat", "events"])),
  events: z.optional(z.array(ProjectionEventSchema)),
  goals: z.optional(z.array(ProjectionGoalSchema)),
});

export const LifetimeProjectionAssumptionsSchema = z.object({
  annualIncome: NonnegativeProjectionAmountSchema,
  annualSpending: NonnegativeProjectionAmountSchema,
  inflationPercent: PercentagePointsSchema,
  annualReturnPercent: PercentagePointsSchema,
  horizonYears: HorizonYearsSchema,
});

export type LifetimeProjectionAssumptions = z.infer<typeof LifetimeProjectionAssumptionsSchema>;

export const LifetimeProjectionAssumptionValuesSchema = z.object({
  annualIncome: NonnegativeProjectionAmountValueSchema,
  annualSpending: NonnegativeProjectionAmountValueSchema,
  inflationPercent: PercentagePointsValueSchema,
  annualReturnPercent: PercentagePointsValueSchema,
  horizonYears: HorizonYearsValueSchema,
});

export type LifetimeProjectionAssumptionValues = z.infer<
  typeof LifetimeProjectionAssumptionValuesSchema
>;

const LifetimeProjectionInputValuesSchema = z.object({
  startingBalance: ProjectionAmountValueSchema,
  annualIncome: NonnegativeProjectionAmountValueSchema,
  annualSpending: NonnegativeProjectionAmountValueSchema,
  inflationPercent: PercentagePointsValueSchema,
  annualReturnPercent: PercentagePointsValueSchema,
  horizonYears: HorizonYearsValueSchema,
  startYear: CalendarYearValueSchema,
  household: z.optional(HouseholdSchema),
  cashFlowMode: z.optional(z.enum(["flat", "events"])),
  events: z.optional(z.array(ProjectionEventSchema)),
  goals: z.optional(z.array(ProjectionGoalSchema)),
});

export const DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS = LifetimeProjectionAssumptionsSchema.parse({
  annualIncome: 80_000,
  annualSpending: 60_000,
  inflationPercent: 2.5,
  annualReturnPercent: 5,
  horizonYears: 30,
});

export type LifetimeProjectionInputs = z.infer<typeof LifetimeProjectionInputsSchema>;

export type LifetimeProjectionPoint = {
  year: number;
  annualIncome: number | null;
  annualSpending: number | null;
  annualSavings: number | null;
  netWorth: number;
  startingNetWorth: number;
  investmentGrowth: number | null;
  baseIncome: number | null;
  baseSpending: number | null;
  incomeInflation: number | null;
  spendingInflation: number | null;
  inflationEffect: number | null;
  regularSpending?: number | null;
  goalSpending?: number | null;
  memberStates?: MemberYearState[];
  eventStatuses?: EventYearStatus[];
  goalEvaluations?: GoalEvaluation[];
};

export class LifetimeProjectionCalculationError extends Error {}
export function parseLifetimeProjectionInputs(
  rawInputs: z.input<typeof LifetimeProjectionInputValuesSchema>,
): LifetimeProjectionInputs {
  const result = LifetimeProjectionInputValuesSchema.safeParse(rawInputs);
  if (!result.success)
    throw new LifetimeProjectionCalculationError("One or more projection inputs are invalid.");

  const { inflationPercent, annualReturnPercent, ...values } = result.data;
  return LifetimeProjectionInputsSchema.parse({
    ...values,
    inflationRate: inflationPercent / 100,
    annualReturnRate: annualReturnPercent / 100,
  });
}

function formatGoalCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function evaluateGoal(
  goal: ProjectionGoal,
  points: LifetimeProjectionPoint[],
  startYear: number,
  horizonYears: number,
): GoalEvaluation {
  const horizonEndYear = startYear + horizonYears;
  const isExp =
    goal.isFlexible &&
    goal.shortfallExperiment.enabled &&
    goal.shortfallExperiment.strategy !== "none";

  const effectiveYear =
    isExp && goal.shortfallExperiment.strategy === "defer"
      ? goal.targetYear + (goal.shortfallExperiment.deferredYears ?? 0)
      : goal.targetYear;

  const effectiveAmount =
    isExp && goal.shortfallExperiment.strategy === "reduce"
      ? (goal.shortfallExperiment.reducedAmount ?? goal.targetAmount)
      : goal.targetAmount;

  const isExperimentActive = isExp;

  if (effectiveYear > horizonEndYear || effectiveYear < startYear) {
    return {
      goalId: goal.id,
      goal,
      status: "not_yet_evaluable",
      statusLabel: "Not yet evaluable",
      effectiveYear,
      effectiveAmount,
      targetAmount: goal.targetAmount,
      originalYear: goal.targetYear,
      fundedAmount: 0,
      shortfallAmount: effectiveAmount,
      fundedPercentage: 0,
      isExperimentActive,
      explanation: `Target year ${effectiveYear} is beyond the ${horizonYears}-year projection horizon (ends in ${horizonEndYear}).`,
      determiningFlowsSummary: `Outside projection horizon (${startYear}–${horizonEndYear})`,
    };
  }

  const point = points.find((p) => p.year === effectiveYear);
  if (!point) {
    return {
      goalId: goal.id,
      goal,
      status: "not_yet_evaluable",
      statusLabel: "Not yet evaluable",
      effectiveYear,
      effectiveAmount,
      targetAmount: goal.targetAmount,
      originalYear: goal.targetYear,
      fundedAmount: 0,
      shortfallAmount: effectiveAmount,
      fundedPercentage: 0,
      isExperimentActive,
      explanation: `No projection data available for year ${effectiveYear}.`,
      determiningFlowsSummary: "No data",
    };
  }

  let experimentSuffix = "";
  if (isExperimentActive) {
    if (goal.shortfallExperiment.strategy === "defer")
      experimentSuffix = ` (deferred +${goal.shortfallExperiment.deferredYears ?? 0} yrs from ${goal.targetYear})`;
    else if (goal.shortfallExperiment.strategy === "reduce")
      experimentSuffix = ` (reduced from ${formatGoalCurrency(goal.targetAmount)})`;
  }

  if (goal.type === "target_balance") {
    const projectedNetWorth = point.netWorth;
    if (projectedNetWorth >= effectiveAmount) {
      const surplus = projectedNetWorth - effectiveAmount;
      return {
        goalId: goal.id,
        goal,
        status: "funded",
        statusLabel: "Funded",
        effectiveYear,
        effectiveAmount,
        targetAmount: goal.targetAmount,
        originalYear: goal.targetYear,
        fundedAmount: effectiveAmount,
        shortfallAmount: 0,
        fundedPercentage: 100,
        isExperimentActive,
        projectedNetWorthAtYear: projectedNetWorth,
        explanation: `Projected net worth is ${formatGoalCurrency(projectedNetWorth)} (surplus of +${formatGoalCurrency(surplus)} above ${formatGoalCurrency(effectiveAmount)} target)${experimentSuffix}.`,
        determiningFlowsSummary: `Year ${effectiveYear} ending net worth: ${formatGoalCurrency(projectedNetWorth)}`,
      };
    }
    if (projectedNetWorth > 0) {
      const shortfall = effectiveAmount - projectedNetWorth;
      const pct = Math.round((projectedNetWorth / effectiveAmount) * 100);
      return {
        goalId: goal.id,
        goal,
        status: "partially_funded",
        statusLabel: "Partially funded",
        effectiveYear,
        effectiveAmount,
        targetAmount: goal.targetAmount,
        originalYear: goal.targetYear,
        fundedAmount: projectedNetWorth,
        shortfallAmount: shortfall,
        fundedPercentage: pct,
        isExperimentActive,
        projectedNetWorthAtYear: projectedNetWorth,
        explanation: `Projected net worth is ${formatGoalCurrency(projectedNetWorth)} (${formatGoalCurrency(shortfall)} shortfall from ${formatGoalCurrency(effectiveAmount)} target, ${pct}% funded)${experimentSuffix}.`,
        determiningFlowsSummary: `Year ${effectiveYear} ending net worth: ${formatGoalCurrency(projectedNetWorth)}`,
      };
    }
    const firstDepleted = points.find((p) => p.netWorth < 0);
    const depletedNote =
      firstDepleted && firstDepleted.year < effectiveYear
        ? ` (plan depleted in ${firstDepleted.year})`
        : "";
    return {
      goalId: goal.id,
      goal,
      status: "missed",
      statusLabel: "Missed",
      effectiveYear,
      effectiveAmount,
      targetAmount: goal.targetAmount,
      originalYear: goal.targetYear,
      fundedAmount: 0,
      shortfallAmount: effectiveAmount,
      fundedPercentage: 0,
      isExperimentActive,
      projectedNetWorthAtYear: projectedNetWorth,
      explanation: `Projected net worth is ${formatGoalCurrency(projectedNetWorth)} in ${effectiveYear}${depletedNote} vs ${formatGoalCurrency(effectiveAmount)} target${experimentSuffix}.`,
      determiningFlowsSummary: `Year ${effectiveYear} balance depleted (${formatGoalCurrency(projectedNetWorth)})`,
    };
  }

  // dated_spending goal
  const regularSpending = (point.annualSpending ?? 0) - (point.goalSpending ?? 0);
  const availableBeforeGoals =
    point.startingNetWorth +
    (point.investmentGrowth ?? 0) +
    (point.annualIncome ?? 0) -
    regularSpending;

  if (availableBeforeGoals >= effectiveAmount) {
    return {
      goalId: goal.id,
      goal,
      status: "funded",
      statusLabel: "Funded",
      effectiveYear,
      effectiveAmount,
      targetAmount: goal.targetAmount,
      originalYear: goal.targetYear,
      fundedAmount: effectiveAmount,
      shortfallAmount: 0,
      fundedPercentage: 100,
      isExperimentActive,
      projectedNetWorthAtYear: point.netWorth,
      explanation: `Fully funded ${formatGoalCurrency(effectiveAmount)} spending in ${effectiveYear} (${formatGoalCurrency(point.netWorth)} remaining balance)${experimentSuffix}.`,
      determiningFlowsSummary: `Available funds before goal: ${formatGoalCurrency(availableBeforeGoals)} vs ${formatGoalCurrency(effectiveAmount)} spending`,
    };
  }
  if (availableBeforeGoals > 0) {
    const shortfall = effectiveAmount - availableBeforeGoals;
    const pct = Math.round((availableBeforeGoals / effectiveAmount) * 100);
    return {
      goalId: goal.id,
      goal,
      status: "partially_funded",
      statusLabel: "Partially funded",
      effectiveYear,
      effectiveAmount,
      targetAmount: goal.targetAmount,
      originalYear: goal.targetYear,
      fundedAmount: availableBeforeGoals,
      shortfallAmount: shortfall,
      fundedPercentage: pct,
      isExperimentActive,
      projectedNetWorthAtYear: point.netWorth,
      explanation: `Available net worth was ${formatGoalCurrency(availableBeforeGoals)} vs ${formatGoalCurrency(effectiveAmount)} target spending (${formatGoalCurrency(shortfall)} shortfall, ${pct}% funded)${experimentSuffix}.`,
      determiningFlowsSummary: `Available funds before goal: ${formatGoalCurrency(availableBeforeGoals)} (${formatGoalCurrency(shortfall)} shortfall)`,
    };
  }
  return {
    goalId: goal.id,
    goal,
    status: "missed",
    statusLabel: "Missed",
    effectiveYear,
    effectiveAmount,
    targetAmount: goal.targetAmount,
    originalYear: goal.targetYear,
    fundedAmount: 0,
    shortfallAmount: effectiveAmount,
    fundedPercentage: 0,
    isExperimentActive,
    projectedNetWorthAtYear: point.netWorth,
    explanation: `Plan had no available assets to fund ${formatGoalCurrency(effectiveAmount)} in ${effectiveYear} (net worth was ${formatGoalCurrency(availableBeforeGoals)})${experimentSuffix}.`,
    determiningFlowsSummary: `Plan had no available funds in ${effectiveYear} (${formatGoalCurrency(availableBeforeGoals)})`,
  };
}

export function evaluateAllGoals(
  goals: ProjectionGoal[],
  points: LifetimeProjectionPoint[],
  startYear: number,
  horizonYears: number,
): GoalEvaluation[] {
  return goals.map((goal) => evaluateGoal(goal, points, startYear, horizonYears));
}

export function calculateLifetimeProjection(
  inputs: LifetimeProjectionInputs,
): LifetimeProjectionPoint[] {
  const members = inputs.household?.members ?? [];
  const initialMemberStates = calculateMemberYearStates(members, inputs.startYear);
  const isEventsMode = inputs.cashFlowMode === "events";
  const events = inputs.events ?? [];
  const goals = inputs.goals ?? [];
  const enabledGoals = goals.filter((g) => g.enabled);

  const initialEventStatuses = isEventsMode
    ? calculateEventYearStatuses(events, inputs.startYear, inputs.startYear, inputs.inflationRate)
    : undefined;

  const projection: LifetimeProjectionPoint[] = [
    {
      year: inputs.startYear,
      annualIncome: null,
      annualSpending: null,
      annualSavings: null,
      netWorth: inputs.startingBalance,
      startingNetWorth: inputs.startingBalance,
      investmentGrowth: null,
      baseIncome: null,
      baseSpending: null,
      incomeInflation: null,
      spendingInflation: null,
      inflationEffect: null,
      regularSpending: null,
      goalSpending: null,
      memberStates: initialMemberStates,
      eventStatuses: initialEventStatuses,
      goalEvaluations: undefined,
    },
  ];
  const inflationFactor = 1 + inputs.inflationRate;
  let netWorth: number = inputs.startingBalance;

  for (let yearOffset = 1; yearOffset <= inputs.horizonYears; yearOffset += 1) {
    const currentYear = inputs.startYear + yearOffset;
    const startingNetWorth = netWorth;
    const investmentGrowth = startingNetWorth * inputs.annualReturnRate;

    let annualIncome: number;
    let annualSpending: number;
    let baseIncome: number;
    let baseSpending: number;
    let currentEventStatuses: EventYearStatus[] | undefined;

    if (isEventsMode) {
      currentEventStatuses = calculateEventYearStatuses(
        events,
        currentYear,
        inputs.startYear,
        inputs.inflationRate,
      );
      const activeIncome = currentEventStatuses.filter((s) => s.isActive && s.type === "income");
      const activeSpending = currentEventStatuses.filter(
        (s) => s.isActive && s.type === "spending",
      );

      annualIncome = activeIncome.reduce((sum, s) => sum + s.adjustedAmount, 0);
      annualSpending = activeSpending.reduce((sum, s) => sum + s.adjustedAmount, 0);
      baseIncome = activeIncome.reduce((sum, s) => sum + s.baseAmount, 0);
      baseSpending = activeSpending.reduce((sum, s) => sum + s.baseAmount, 0);
    } else {
      annualIncome = inputs.annualIncome * inflationFactor ** (yearOffset - 1);
      annualSpending = inputs.annualSpending * inflationFactor ** (yearOffset - 1);
      baseIncome = inputs.annualIncome;
      baseSpending = inputs.annualSpending;
    }

    // Process dated spending goals for currentYear
    const activeSpendingGoals = enabledGoals.filter((g) => {
      if (g.type !== "dated_spending") return false;
      const isExp =
        g.isFlexible && g.shortfallExperiment.enabled && g.shortfallExperiment.strategy === "defer";
      const effYear = isExp
        ? g.targetYear + (g.shortfallExperiment.deferredYears ?? 0)
        : g.targetYear;
      return effYear === currentYear;
    });

    const goalSpending = activeSpendingGoals.reduce((sum, g) => {
      const isExp =
        g.isFlexible &&
        g.shortfallExperiment.enabled &&
        g.shortfallExperiment.strategy === "reduce";
      const effAmount = isExp
        ? (g.shortfallExperiment.reducedAmount ?? g.targetAmount)
        : g.targetAmount;
      return sum + effAmount;
    }, 0);

    const regularSpending = annualSpending;
    annualSpending += goalSpending;
    baseSpending += goalSpending;

    const annualSavings = annualIncome - annualSpending;
    const incomeInflation = annualIncome - baseIncome;
    const spendingInflation = annualSpending - baseSpending;
    const inflationEffect = incomeInflation - spendingInflation;

    netWorth = startingNetWorth + investmentGrowth + annualSavings;

    if (!Number.isFinite(netWorth))
      throw new LifetimeProjectionCalculationError("The projection produced a non-finite result.");

    projection.push({
      year: currentYear,
      annualIncome,
      annualSpending,
      annualSavings,
      netWorth,
      startingNetWorth,
      investmentGrowth,
      baseIncome,
      baseSpending,
      incomeInflation,
      spendingInflation,
      inflationEffect,
      regularSpending,
      goalSpending,
      memberStates: calculateMemberYearStates(members, currentYear),
      eventStatuses: currentEventStatuses,
      goalEvaluations: undefined,
    });
  }

  // Populate goalEvaluations for all points
  const allEvaluations = evaluateAllGoals(
    enabledGoals,
    projection,
    inputs.startYear,
    inputs.horizonYears,
  );
  for (const point of projection)
    point.goalEvaluations = allEvaluations.filter((ev) => ev.effectiveYear === point.year);

  return projection;
}
