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

export const ProjectionDebtSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  category: z.enum(["mortgage", "auto", "student", "other"]).default("mortgage"),
  startingBalance: z.number().nonnegative(),
  interestRatePercent: z.number().min(0).max(100),
  termYears: z.number().int().min(1).max(50),
  startYear: z.number().int().min(1900).max(2150),
  extraAnnualPayment: z.number().nonnegative().default(0),
  linkedAssetId: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type ProjectionDebt = z.infer<typeof ProjectionDebtSchema>;

export const ProjectionRealAssetSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  category: z.enum(["property", "vehicle", "other_asset"]).default("property"),
  initialValue: z.number().nonnegative(),
  purchaseYear: z.number().int().min(1900).max(2150),
  annualAppreciationPercent: z.number().min(-100).max(100).default(0),
  annualCarryingCost: z.number().nonnegative().default(0),
  saleYear: z.number().int().min(1900).max(2150).optional(),
  linkedDebtId: z.string().optional(),
  enabled: z.boolean().default(true),
});

export type ProjectionRealAsset = z.infer<typeof ProjectionRealAssetSchema>;

export type DebtYearStatus = {
  debtId: string;
  name: string;
  category: "mortgage" | "auto" | "student" | "other";
  startYear: number;
  isActive: boolean;
  isPaidOff: boolean;
  isPaidOffThisYear: boolean;
  payoffYear?: number;
  startingBalance: number;
  interestAccrued: number;
  scheduledPrincipalPaid: number;
  extraPrincipalPaid: number;
  totalPrincipalPaid: number;
  totalPayment: number;
  endingBalance: number;
  scheduledPayoffYear: number;
  actualPayoffYear: number;
  yearsSavedByExtraPayments: number;
  interestSavedByExtraPayments: number;
  clearedBySaleOfAsset?: boolean;
};

export type RealAssetYearStatus = {
  assetId: string;
  name: string;
  category: "property" | "vehicle" | "other_asset";
  purchaseYear: number;
  isPurchasedThisYear: boolean;
  isOwned: boolean;
  isSoldThisYear: boolean;
  saleYear?: number;
  startingValue: number;
  appreciationOrDepreciation: number;
  endingValue: number;
  annualCarryingCost: number;
  purchaseCashOutflow: number;
  grossSaleProceeds: number;
  debtClearedAtSale: number;
  netSaleProceeds: number;
  linkedDebtId?: string;
  netEquity: number;
};

export type DebtsAssetsProjectionSummary = {
  activeDebtsCount: number;
  activeAssetsCount: number;
  currentDebtBalance: number;
  currentAssetsValue: number;
  currentNetEquity: number;
  planEndDebtBalance: number;
  planEndAssetsValue: number;
  planEndNetEquity: number;
  totalDebtServiceOverHorizon: number;
  totalCarryingCostsOverHorizon: number;
  totalInterestSavedOverHorizon: number;
  hasEarlyPayoffs: boolean;
  hasSalesBeforePayoff: boolean;
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
  debts: z.optional(z.array(ProjectionDebtSchema)),
  realAssets: z.optional(z.array(ProjectionRealAssetSchema)),
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
  debts: z.optional(z.array(ProjectionDebtSchema)),
  realAssets: z.optional(z.array(ProjectionRealAssetSchema)),
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
  liquidPortfolio: number;
  realAssetsValue: number;
  totalDebtBalance: number;
  netEquity: number;
  debtPayments?: number | null;
  carryingCosts?: number | null;
  assetPurchasesOutflow?: number | null;
  assetSalesInflow?: number | null;
  memberStates?: MemberYearState[];
  eventStatuses?: EventYearStatus[];
  goalEvaluations?: GoalEvaluation[];
  debtStatuses?: DebtYearStatus[];
  assetStatuses?: RealAssetYearStatus[];
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

export function calculateScheduledAnnualPayment(
  principal: number,
  interestRatePercent: number,
  termYears: number,
): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const rate = interestRatePercent / 100;
  if (rate <= 0) return principal / termYears;
  return (principal * rate) / (1 - (1 + rate) ** -termYears);
}

export function calculateTotalInterestWithoutExtra(
  principal: number,
  interestRatePercent: number,
  termYears: number,
): number {
  const annual = calculateScheduledAnnualPayment(principal, interestRatePercent, termYears);
  return Math.max(0, annual * termYears - principal);
}

export function simulateDebtPayoff(debt: ProjectionDebt): {
  scheduledPayoffYear: number;
  actualPayoffYear: number;
  scheduledAnnualPayment: number;
  totalPaymentWithExtra: number;
  yearsSaved: number;
  totalInterestWithoutExtra: number;
  totalInterestWithExtra: number;
  interestSaved: number;
} {
  const scheduledAnnual = calculateScheduledAnnualPayment(
    debt.startingBalance,
    debt.interestRatePercent,
    debt.termYears,
  );
  const scheduledPayoffYear = debt.startYear + debt.termYears;
  const totalInterestWithoutExtra = calculateTotalInterestWithoutExtra(
    debt.startingBalance,
    debt.interestRatePercent,
    debt.termYears,
  );

  if (debt.extraAnnualPayment <= 0 || debt.startingBalance <= 0) {
    return {
      scheduledPayoffYear,
      actualPayoffYear: scheduledPayoffYear,
      scheduledAnnualPayment: scheduledAnnual,
      totalPaymentWithExtra: scheduledAnnual,
      yearsSaved: 0,
      totalInterestWithoutExtra,
      totalInterestWithExtra: totalInterestWithoutExtra,
      interestSaved: 0,
    };
  }

  let balance = debt.startingBalance;
  const rate = debt.interestRatePercent / 100;
  let totalInterestWithExtra = 0;
  let actualPayoffYear = scheduledPayoffYear;

  for (let y = 1; y <= debt.termYears + 10; y += 1) {
    if (balance <= 0.01) {
      actualPayoffYear = debt.startYear + y - 1;
      break;
    }
    const interest = balance * rate;
    totalInterestWithExtra += interest;
    const maxPayoff = balance + interest;
    const scheduled = Math.min(scheduledAnnual, maxPayoff);
    const afterScheduled = maxPayoff - scheduled;
    const extra = Math.min(debt.extraAnnualPayment, afterScheduled);
    const total = scheduled + extra;
    balance = Math.max(0, balance + interest - total);

    if (balance <= 0.01) {
      actualPayoffYear = debt.startYear + y;
      break;
    }
  }

  const yearsSaved = Math.max(0, scheduledPayoffYear - actualPayoffYear);
  const interestSaved = Math.max(0, totalInterestWithoutExtra - totalInterestWithExtra);

  return {
    scheduledPayoffYear,
    actualPayoffYear,
    scheduledAnnualPayment: scheduledAnnual,
    totalPaymentWithExtra: scheduledAnnual + debt.extraAnnualPayment,
    yearsSaved,
    totalInterestWithoutExtra,
    totalInterestWithExtra,
    interestSaved,
  };
}

export function summarizeDebtsAndAssets(
  points: LifetimeProjectionPoint[],
): DebtsAssetsProjectionSummary {
  if (points.length === 0) {
    return {
      activeDebtsCount: 0,
      activeAssetsCount: 0,
      currentDebtBalance: 0,
      currentAssetsValue: 0,
      currentNetEquity: 0,
      planEndDebtBalance: 0,
      planEndAssetsValue: 0,
      planEndNetEquity: 0,
      totalDebtServiceOverHorizon: 0,
      totalCarryingCostsOverHorizon: 0,
      totalInterestSavedOverHorizon: 0,
      hasEarlyPayoffs: false,
      hasSalesBeforePayoff: false,
    };
  }

  const firstPoint = points[0];
  const lastPoint = points.at(-1)!;

  let totalDebtService = 0;
  let totalCarryingCosts = 0;
  let totalInterestSaved = 0;
  let hasEarlyPayoffs = false;
  let hasSalesBeforePayoff = false;

  for (const point of points) {
    totalDebtService += point.debtPayments ?? 0;
    totalCarryingCosts += point.carryingCosts ?? 0;

    for (const d of point.debtStatuses ?? []) {
      if (d.yearsSavedByExtraPayments > 0) {
        hasEarlyPayoffs = true;
        totalInterestSaved = Math.max(totalInterestSaved, d.interestSavedByExtraPayments);
      }
      if (d.clearedBySaleOfAsset === true) hasSalesBeforePayoff = true;
    }
  }

  return {
    activeDebtsCount: (firstPoint.debtStatuses ?? []).filter((d) => d.isActive).length,
    activeAssetsCount: (firstPoint.assetStatuses ?? []).filter((a) => a.isOwned).length,
    currentDebtBalance: firstPoint.totalDebtBalance,
    currentAssetsValue: firstPoint.realAssetsValue,
    currentNetEquity: firstPoint.netEquity,
    planEndDebtBalance: lastPoint.totalDebtBalance,
    planEndAssetsValue: lastPoint.realAssetsValue,
    planEndNetEquity: lastPoint.netEquity,
    totalDebtServiceOverHorizon: totalDebtService,
    totalCarryingCostsOverHorizon: totalCarryingCosts,
    totalInterestSavedOverHorizon: totalInterestSaved,
    hasEarlyPayoffs,
    hasSalesBeforePayoff,
  };
}

export function createExampleDebtsAndAssets(startYear = new Date().getFullYear()): {
  debts: ProjectionDebt[];
  realAssets: ProjectionRealAsset[];
} {
  const homeAssetId = "asset-primary-home";
  const mortgageDebtId = "debt-primary-mortgage";
  const vehicleAssetId = "asset-commuter-car";

  return {
    debts: [
      {
        id: mortgageDebtId,
        name: "Primary Mortgage",
        category: "mortgage",
        startingBalance: 320_000,
        interestRatePercent: 5,
        termYears: 25,
        startYear,
        extraAnnualPayment: 0,
        linkedAssetId: homeAssetId,
        enabled: true,
      },
    ],
    realAssets: [
      {
        id: homeAssetId,
        name: "Family Home",
        category: "property",
        initialValue: 450_000,
        purchaseYear: startYear,
        annualAppreciationPercent: 3.5,
        annualCarryingCost: 4_500,
        linkedDebtId: mortgageDebtId,
        enabled: true,
      },
      {
        id: vehicleAssetId,
        name: "Commuter Car",
        category: "vehicle",
        initialValue: 35_000,
        purchaseYear: startYear,
        annualAppreciationPercent: -15,
        annualCarryingCost: 1_800,
        enabled: true,
      },
    ],
  };
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

  const debts = (inputs.debts ?? []).filter((d) => d.enabled);
  const realAssets = (inputs.realAssets ?? []).filter((a) => a.enabled);

  const initialEventStatuses = isEventsMode
    ? calculateEventYearStatuses(events, inputs.startYear, inputs.startYear, inputs.inflationRate)
    : undefined;

  // Calculate baseline real asset values and debt balances for existing assets/debts
  const existingDebts = debts.filter((d) => d.startYear <= inputs.startYear);
  const initialDebtsBalance = existingDebts.reduce((sum, d) => sum + d.startingBalance, 0);

  const existingRealAssets = realAssets.filter((a) => a.purchaseYear <= inputs.startYear);
  const initialRealAssetsValue = existingRealAssets.reduce((sum, a) => sum + a.initialValue, 0);

  const initialTotalNetWorth = inputs.startingBalance;
  // Liquid Portfolio = Total Net Worth - Real Assets + Debts
  const initialLiquidPortfolio =
    initialTotalNetWorth - initialRealAssetsValue + initialDebtsBalance;

  const initialDebtStatuses: DebtYearStatus[] = existingDebts.map((d) => {
    const payoffSim = simulateDebtPayoff(d);
    return {
      debtId: d.id,
      name: d.name,
      category: d.category,
      startYear: d.startYear,
      isActive: true,
      isPaidOff: false,
      isPaidOffThisYear: false,
      payoffYear: undefined,
      startingBalance: d.startingBalance,
      interestAccrued: 0,
      scheduledPrincipalPaid: 0,
      extraPrincipalPaid: 0,
      totalPrincipalPaid: 0,
      totalPayment: 0,
      endingBalance: d.startingBalance,
      scheduledPayoffYear: payoffSim.scheduledPayoffYear,
      actualPayoffYear: payoffSim.actualPayoffYear,
      yearsSavedByExtraPayments: payoffSim.yearsSaved,
      interestSavedByExtraPayments: payoffSim.interestSaved,
    };
  });

  const initialAssetStatuses: RealAssetYearStatus[] = existingRealAssets.map((a) => {
    const linkedDebt = debts.find((d) => d.id === a.linkedDebtId || d.linkedAssetId === a.id);
    const linkedDebtBalance =
      linkedDebt && linkedDebt.startYear <= inputs.startYear ? linkedDebt.startingBalance : 0;
    return {
      assetId: a.id,
      name: a.name,
      category: a.category,
      purchaseYear: a.purchaseYear,
      isPurchasedThisYear: false,
      isOwned: true,
      isSoldThisYear: false,
      saleYear: a.saleYear,
      startingValue: a.initialValue,
      appreciationOrDepreciation: 0,
      endingValue: a.initialValue,
      annualCarryingCost: 0,
      purchaseCashOutflow: 0,
      grossSaleProceeds: 0,
      debtClearedAtSale: 0,
      netSaleProceeds: 0,
      linkedDebtId: a.linkedDebtId,
      netEquity: a.initialValue - linkedDebtBalance,
    };
  });

  const projection: LifetimeProjectionPoint[] = [
    {
      year: inputs.startYear,
      annualIncome: null,
      annualSpending: null,
      annualSavings: null,
      netWorth: initialTotalNetWorth,
      startingNetWorth: initialTotalNetWorth,
      investmentGrowth: null,
      baseIncome: null,
      baseSpending: null,
      incomeInflation: null,
      spendingInflation: null,
      inflationEffect: null,
      regularSpending: null,
      goalSpending: null,
      liquidPortfolio: initialLiquidPortfolio,
      realAssetsValue: initialRealAssetsValue,
      totalDebtBalance: initialDebtsBalance,
      netEquity: initialRealAssetsValue - initialDebtsBalance,
      debtPayments: null,
      carryingCosts: null,
      assetPurchasesOutflow: null,
      assetSalesInflow: null,
      memberStates: initialMemberStates,
      eventStatuses: initialEventStatuses,
      goalEvaluations: undefined,
      debtStatuses: initialDebtStatuses,
      assetStatuses: initialAssetStatuses,
    },
  ];

  const inflationFactor = 1 + inputs.inflationRate;
  let liquidPortfolio = initialLiquidPortfolio;

  // Running states for debts and assets
  const debtCurrentBalances = new Map<string, number>();
  const debtPaidOff = new Map<string, boolean>();
  for (const d of debts) {
    debtCurrentBalances.set(d.id, d.startingBalance);
    debtPaidOff.set(d.id, false);
  }

  const assetCurrentValues = new Map<string, number>();
  const assetOwned = new Map<string, boolean>();
  for (const a of realAssets) {
    if (a.purchaseYear <= inputs.startYear) {
      assetCurrentValues.set(a.id, a.initialValue);
      assetOwned.set(a.id, true);
    } else {
      assetCurrentValues.set(a.id, 0);
      assetOwned.set(a.id, false);
    }
  }

  for (let yearOffset = 1; yearOffset <= inputs.horizonYears; yearOffset += 1) {
    const currentYear = inputs.startYear + yearOffset;
    const startingLiquidPortfolio = liquidPortfolio;
    const investmentGrowth = startingLiquidPortfolio * inputs.annualReturnRate;

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

    // Simulate debts for currentYear
    const debtYearStatuses: DebtYearStatus[] = [];
    const debtClearedMap = new Map<string, number>();

    for (const d of debts) {
      const payoffSim = simulateDebtPayoff(d);
      const isAlreadyPaid = debtPaidOff.get(d.id) ?? false;
      const hasStarted = currentYear >= d.startYear;

      if (!hasStarted || isAlreadyPaid) {
        debtYearStatuses.push({
          debtId: d.id,
          name: d.name,
          category: d.category,
          startYear: d.startYear,
          isActive: false,
          isPaidOff: isAlreadyPaid,
          isPaidOffThisYear: false,
          payoffYear: isAlreadyPaid ? currentYear : undefined,
          startingBalance: 0,
          interestAccrued: 0,
          scheduledPrincipalPaid: 0,
          extraPrincipalPaid: 0,
          totalPrincipalPaid: 0,
          totalPayment: 0,
          endingBalance: 0,
          scheduledPayoffYear: payoffSim.scheduledPayoffYear,
          actualPayoffYear: payoffSim.actualPayoffYear,
          yearsSavedByExtraPayments: payoffSim.yearsSaved,
          interestSavedByExtraPayments: payoffSim.interestSaved,
        });
        continue;
      }

      const startingDebtBalance = debtCurrentBalances.get(d.id) ?? d.startingBalance;
      const rate = d.interestRatePercent / 100;
      const interestAccrued = startingDebtBalance * rate;
      const scheduledAnnual = calculateScheduledAnnualPayment(
        d.startingBalance,
        d.interestRatePercent,
        d.termYears,
      );
      const maxPayoff = startingDebtBalance + interestAccrued;
      const scheduledPI = Math.min(scheduledAnnual, maxPayoff);
      const remainingAfterScheduled = maxPayoff - scheduledPI;
      const extra = Math.min(d.extraAnnualPayment, remainingAfterScheduled);
      const totalPayment = scheduledPI + extra;
      const scheduledPrincipal = Math.max(0, scheduledPI - interestAccrued);
      const totalPrincipal = scheduledPrincipal + extra;
      let endingDebtBalance = Math.max(0, startingDebtBalance + interestAccrued - totalPayment);
      if (endingDebtBalance <= 0.01) endingDebtBalance = 0;

      // Check if linked asset is sold in currentYear (sale before payoff!)
      const linkedAsset = realAssets.find(
        (a) => a.id === d.linkedAssetId || a.linkedDebtId === d.id,
      );
      let clearedBySale = false;
      if (linkedAsset && linkedAsset.saleYear === currentYear && endingDebtBalance > 0) {
        clearedBySale = true;
        debtClearedMap.set(d.id, endingDebtBalance);
        endingDebtBalance = 0;
      }

      const isPaidOffThisYear = endingDebtBalance === 0;
      if (isPaidOffThisYear) debtPaidOff.set(d.id, true);
      debtCurrentBalances.set(d.id, endingDebtBalance);

      debtYearStatuses.push({
        debtId: d.id,
        name: d.name,
        category: d.category,
        startYear: d.startYear,
        isActive: true,
        isPaidOff: isPaidOffThisYear,
        isPaidOffThisYear,
        payoffYear: isPaidOffThisYear ? currentYear : undefined,
        startingBalance: startingDebtBalance,
        interestAccrued,
        scheduledPrincipalPaid: scheduledPrincipal,
        extraPrincipalPaid: extra,
        totalPrincipalPaid: totalPrincipal,
        totalPayment,
        endingBalance: endingDebtBalance,
        scheduledPayoffYear: payoffSim.scheduledPayoffYear,
        actualPayoffYear: payoffSim.actualPayoffYear,
        yearsSavedByExtraPayments: payoffSim.yearsSaved,
        interestSavedByExtraPayments: payoffSim.interestSaved,
        clearedBySaleOfAsset: clearedBySale,
      });
    }

    // Simulate real assets for currentYear
    const assetYearStatuses: RealAssetYearStatus[] = [];

    for (const a of realAssets) {
      const isOwned = assetOwned.get(a.id) ?? false;
      const isPurchaseYear = a.purchaseYear === currentYear;
      const isSaleYear = a.saleYear === currentYear;

      let startingValue = 0;
      let appreciation = 0;
      let endingValue = 0;
      let carryingCost = 0;
      let purchaseCashOutflow = 0;
      let grossSaleProceeds = 0;
      let debtClearedAtSale = 0;
      let netSaleProceeds = 0;

      if (currentYear < a.purchaseYear) {
        // Not yet acquired
        assetYearStatuses.push({
          assetId: a.id,
          name: a.name,
          category: a.category,
          purchaseYear: a.purchaseYear,
          isPurchasedThisYear: false,
          isOwned: false,
          isSoldThisYear: false,
          saleYear: a.saleYear,
          startingValue: 0,
          appreciationOrDepreciation: 0,
          endingValue: 0,
          annualCarryingCost: 0,
          purchaseCashOutflow: 0,
          grossSaleProceeds: 0,
          debtClearedAtSale: 0,
          netSaleProceeds: 0,
          linkedDebtId: a.linkedDebtId,
          netEquity: 0,
        });
        continue;
      }

      if (isPurchaseYear) {
        startingValue = a.initialValue;
        endingValue = a.initialValue;
        assetOwned.set(a.id, true);
        carryingCost = a.annualCarryingCost;

        if (a.purchaseYear > inputs.startYear) {
          // Future purchase: compute down payment outflow
          const linkedDebt = debts.find(
            (d) =>
              (d.id === a.linkedDebtId || d.linkedAssetId === a.id) && d.startYear === currentYear,
          );
          const debtFinancing = linkedDebt ? linkedDebt.startingBalance : 0;
          purchaseCashOutflow = Math.max(0, a.initialValue - debtFinancing);
        }
      } else if (isOwned) {
        startingValue = assetCurrentValues.get(a.id) ?? a.initialValue;
        appreciation = startingValue * (a.annualAppreciationPercent / 100);
        endingValue = Math.max(0, startingValue + appreciation);
        carryingCost = a.annualCarryingCost;
      }

      if (isSaleYear && (isOwned || isPurchaseYear)) {
        assetOwned.set(a.id, false);
        grossSaleProceeds = endingValue;
        const linkedDebt = debts.find((d) => d.id === a.linkedDebtId || d.linkedAssetId === a.id);
        if (linkedDebt) {
          debtClearedAtSale = debtClearedMap.get(linkedDebt.id) ?? 0;
          netSaleProceeds = Math.max(0, grossSaleProceeds - debtClearedAtSale);
        } else netSaleProceeds = grossSaleProceeds;
        // Value zeroed after sale
        endingValue = 0;
      }

      assetCurrentValues.set(a.id, endingValue);

      // Net equity = endingValue - linked debt ending balance
      const linkedDebt = debts.find((d) => d.id === a.linkedDebtId || d.linkedAssetId === a.id);
      const linkedDebtBalance = linkedDebt
        ? (debtYearStatuses.find((s) => s.debtId === linkedDebt.id)?.endingBalance ?? 0)
        : 0;

      assetYearStatuses.push({
        assetId: a.id,
        name: a.name,
        category: a.category,
        purchaseYear: a.purchaseYear,
        isPurchasedThisYear: isPurchaseYear,
        isOwned: isSaleYear ? false : isOwned || isPurchaseYear,
        isSoldThisYear: isSaleYear,
        saleYear: a.saleYear,
        startingValue,
        appreciationOrDepreciation: appreciation,
        endingValue,
        annualCarryingCost: carryingCost,
        purchaseCashOutflow,
        grossSaleProceeds,
        debtClearedAtSale,
        netSaleProceeds,
        linkedDebtId: a.linkedDebtId,
        netEquity: endingValue - linkedDebtBalance,
      });
    }

    const totalDebtPayments = debtYearStatuses.reduce((sum, s) => sum + s.totalPayment, 0);
    const totalCarryingCosts = assetYearStatuses.reduce((sum, s) => sum + s.annualCarryingCost, 0);
    const totalAssetPurchases = assetYearStatuses.reduce(
      (sum, s) => sum + s.purchaseCashOutflow,
      0,
    );
    const totalAssetSalesNet = assetYearStatuses.reduce((sum, s) => sum + s.netSaleProceeds, 0);

    const totalOutflows =
      regularSpending + goalSpending + totalDebtPayments + totalCarryingCosts + totalAssetPurchases;
    const totalInflows = annualIncome + totalAssetSalesNet;
    const annualSavings = totalInflows - totalOutflows;

    liquidPortfolio = startingLiquidPortfolio + investmentGrowth + annualSavings;

    const totalRealAssetsValue = assetYearStatuses.reduce((sum, s) => sum + s.endingValue, 0);
    const totalDebtBalance = debtYearStatuses.reduce((sum, s) => sum + s.endingBalance, 0);
    const netEquity = totalRealAssetsValue - totalDebtBalance;
    const netWorth = liquidPortfolio + totalRealAssetsValue - totalDebtBalance;

    const incomeInflation = annualIncome - baseIncome;
    const spendingInflation = annualSpending - baseSpending;
    const inflationEffect = incomeInflation - spendingInflation;

    if (!Number.isFinite(netWorth))
      throw new LifetimeProjectionCalculationError("The projection produced a non-finite result.");

    projection.push({
      year: currentYear,
      annualIncome,
      annualSpending: totalOutflows,
      annualSavings,
      netWorth,
      startingNetWorth: projection.at(-1)!.netWorth,
      investmentGrowth,
      baseIncome,
      baseSpending,
      incomeInflation,
      spendingInflation,
      inflationEffect,
      regularSpending,
      goalSpending,
      liquidPortfolio,
      realAssetsValue: totalRealAssetsValue,
      totalDebtBalance,
      netEquity,
      debtPayments: totalDebtPayments,
      carryingCosts: totalCarryingCosts,
      assetPurchasesOutflow: totalAssetPurchases,
      assetSalesInflow: totalAssetSalesNet,
      memberStates: calculateMemberYearStates(members, currentYear),
      eventStatuses: currentEventStatuses,
      goalEvaluations: undefined,
      debtStatuses: debtYearStatuses,
      assetStatuses: assetYearStatuses,
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
