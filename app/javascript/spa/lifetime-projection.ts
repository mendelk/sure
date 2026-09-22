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

export const LifetimeProjectionInputsSchema = z.object({
  startingBalance: ProjectionAmountSchema,
  annualIncome: NonnegativeProjectionAmountSchema,
  annualSpending: NonnegativeProjectionAmountSchema,
  inflationRate: AnnualRateSchema,
  annualReturnRate: AnnualRateSchema,
  horizonYears: HorizonYearsSchema,
  startYear: CalendarYearSchema,
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
    },
  ];
  const inflationFactor = 1 + inputs.inflationRate;
  let netWorth: number = inputs.startingBalance;

  for (let yearOffset = 1; yearOffset <= inputs.horizonYears; yearOffset += 1) {
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
      year: inputs.startYear + yearOffset,
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
    });
  }

  return projection;
}
