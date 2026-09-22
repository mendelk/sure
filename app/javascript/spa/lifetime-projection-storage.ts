import { z } from "zod";
import {
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  LifetimeProjectionAssumptionsSchema,
  type LifetimeProjectionAssumptions,
} from "./lifetime-projection";

export const LifetimePlanBaselineSchema = z.object({
  netWorth: z.number(),
  capturedAt: z.string(),
});

export const LifetimePlanDisplaySchema = z.looseObject({});

export const LifetimePlanSnapshotSchema = z.object({
  baseline: LifetimePlanBaselineSchema,
  assumptions: z.object({
    annualIncome: z.number().nonnegative(),
    annualSpending: z.number().nonnegative(),
    inflationPercent: z.number().gt(-100),
    annualReturnPercent: z.number().gt(-100),
    horizonYears: z.number().int().min(1).max(100),
  }),
  display: z.optional(LifetimePlanDisplaySchema),
});

export type LifetimePlanBaseline = z.infer<typeof LifetimePlanBaselineSchema>;
export type LifetimePlanDisplay = z.infer<typeof LifetimePlanDisplaySchema>;

export type LifetimePlanSnapshot = {
  baseline: LifetimePlanBaseline;
  assumptions: LifetimeProjectionAssumptions;
  display?: LifetimePlanDisplay;
};

export function lifetimeProjectionStorageKey(userId: string): string {
  return `sure:lifetime-projection:${userId}`;
}

export function readLifetimePlanSnapshot(userId: string): LifetimePlanSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(lifetimeProjectionStorageKey(userId));
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const result = LifetimePlanSnapshotSchema.safeParse(parsed);
    if (!result.success) return undefined;

    const validatedAssumptions = LifetimeProjectionAssumptionsSchema.safeParse(
      result.data.assumptions,
    );
    if (!validatedAssumptions.success) return undefined;

    return {
      baseline: result.data.baseline,
      assumptions: validatedAssumptions.data,
      display: result.data.display,
    };
  } catch {
    return undefined;
  }
}

export function writeLifetimePlanSnapshot(userId: string, snapshot: LifetimePlanSnapshot): void {
  try {
    window.localStorage.setItem(lifetimeProjectionStorageKey(userId), JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (private mode, quota exceeded) — session continues.
  }
}

export function clearLifetimePlanSnapshot(userId: string): void {
  try {
    window.localStorage.removeItem(lifetimeProjectionStorageKey(userId));
  } catch {
    // Best-effort
  }
}

export function loadInitialLifetimePlan(
  userId: string,
  currentNetWorthAmount: number,
): {
  assumptions: LifetimeProjectionAssumptions;
  baseline: LifetimePlanBaseline;
  isSaved: boolean;
} {
  const saved = readLifetimePlanSnapshot(userId);
  if (saved !== undefined) {
    return {
      assumptions: saved.assumptions,
      baseline: saved.baseline,
      isSaved: true,
    };
  }

  return {
    assumptions: DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
    baseline: {
      netWorth: currentNetWorthAmount,
      capturedAt: new Date().toISOString(),
    },
    isSaved: false,
  };
}
