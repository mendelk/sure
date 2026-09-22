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
  memberStates?: MemberYearState[];
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

export function calculateLifetimeProjection(
  inputs: LifetimeProjectionInputs,
): LifetimeProjectionPoint[] {
  const members = inputs.household?.members ?? [];
  const initialMemberStates = calculateMemberYearStates(members, inputs.startYear);

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
      memberStates: initialMemberStates,
    },
  ];
  const inflationFactor = 1 + inputs.inflationRate;
  let netWorth: number = inputs.startingBalance;

  for (let yearOffset = 1; yearOffset <= inputs.horizonYears; yearOffset += 1) {
    const currentYear = inputs.startYear + yearOffset;
    const startingNetWorth = netWorth;
    const investmentGrowth = startingNetWorth * inputs.annualReturnRate;
    const annualIncome = inputs.annualIncome * inflationFactor ** (yearOffset - 1);
    const annualSpending = inputs.annualSpending * inflationFactor ** (yearOffset - 1);
    const annualSavings = annualIncome - annualSpending;
    const baseIncome = inputs.annualIncome;
    const baseSpending = inputs.annualSpending;
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
      memberStates: calculateMemberYearStates(members, currentYear),
    });
  }

  return projection;
}
