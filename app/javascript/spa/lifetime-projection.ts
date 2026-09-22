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

const LifetimeProjectionAssumptionsSchema = z.object({
  annualIncome: NonnegativeProjectionAmountSchema,
  annualSpending: NonnegativeProjectionAmountSchema,
  inflationPercent: PercentagePointsSchema,
  annualReturnPercent: PercentagePointsSchema,
  horizonYears: HorizonYearsSchema,
});

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
    },
  ];
  const inflationFactor = 1 + inputs.inflationRate;
  const returnFactor = 1 + inputs.annualReturnRate;
  let netWorth: number = inputs.startingBalance;

  for (let yearOffset = 1; yearOffset <= inputs.horizonYears; yearOffset += 1) {
    const annualIncome = inputs.annualIncome * inflationFactor ** (yearOffset - 1);
    const annualSpending = inputs.annualSpending * inflationFactor ** (yearOffset - 1);
    const annualSavings = annualIncome - annualSpending;
    netWorth = netWorth * returnFactor + annualSavings;

    if (!Number.isFinite(netWorth))
      throw new LifetimeProjectionCalculationError("The projection produced a non-finite result.");

    projection.push({
      year: inputs.startYear + yearOffset,
      annualIncome,
      annualSpending,
      annualSavings,
      netWorth,
    });
  }

  return projection;
}
