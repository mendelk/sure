import { z } from "zod";
import {
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  LifetimeProjectionAssumptionsSchema,
  type LifetimeProjectionAssumptions,
} from "./lifetime-projection";

export const STARTER_LIFETIME_PLAN_VERSION = 1;
export const STARTER_LIFETIME_PLAN_ASSUMPTIONS: LifetimeProjectionAssumptions =
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS;

export const LifetimePlanBaselineSchema = z.object({
  netWorth: z.number(),
  capturedAt: z.string(),
});

export const LifetimePlanDisplaySchema = z.looseObject({});

export const LifetimePlanSnapshotSchema = z.object({
  version: z.optional(z.number().int()),
  planType: z.optional(z.enum(["starter", "custom"])),
  baseline: LifetimePlanBaselineSchema,
  assumptions: z.object({
    annualIncome: z.number().nonnegative(),
    annualSpending: z.number().nonnegative(),
    inflationPercent: z.number().gt(-100),
    annualReturnPercent: z.number().gt(-100),
    horizonYears: z.number().int().min(1).max(100),
  }),
  display: z.optional(LifetimePlanDisplaySchema),
  updatedAt: z.optional(z.string()),
});

export type LifetimePlanBaseline = z.infer<typeof LifetimePlanBaselineSchema>;
export type LifetimePlanDisplay = z.infer<typeof LifetimePlanDisplaySchema>;

export type LifetimePlanSnapshot = {
  version?: number;
  planType?: "starter" | "custom";
  baseline: LifetimePlanBaseline;
  assumptions: LifetimeProjectionAssumptions;
  display?: LifetimePlanDisplay;
  updatedAt?: string;
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
      version: result.data.version ?? STARTER_LIFETIME_PLAN_VERSION,
      planType: result.data.planType ?? "custom",
      baseline: result.data.baseline,
      assumptions: validatedAssumptions.data,
      display: result.data.display,
      updatedAt: result.data.updatedAt,
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

export function starterLifetimePlanSnapshot(startingNetWorth: number): LifetimePlanSnapshot {
  return {
    version: STARTER_LIFETIME_PLAN_VERSION,
    planType: "starter",
    baseline: {
      netWorth: startingNetWorth,
      capturedAt: new Date().toISOString(),
    },
    assumptions: STARTER_LIFETIME_PLAN_ASSUMPTIONS,
    updatedAt: new Date().toISOString(),
  };
}

// Create the starter only when no user plan exists in local storage.
// Never overwrite a locally edited plan during an application update or reload.
export function loadOrInstallStarterLifetimePlan(
  userId: string,
  currentNetWorthAmount: number,
): {
  assumptions: LifetimeProjectionAssumptions;
  baseline: LifetimePlanBaseline;
  isSaved: boolean;
  planType: "starter" | "custom";
} {
  const existing = readLifetimePlanSnapshot(userId);
  if (existing !== undefined) {
    return {
      assumptions: existing.assumptions,
      baseline: existing.baseline,
      isSaved: true,
      planType: existing.planType ?? "custom",
    };
  }

  const starter = starterLifetimePlanSnapshot(currentNetWorthAmount);
  writeLifetimePlanSnapshot(userId, starter);

  return {
    assumptions: starter.assumptions,
    baseline: starter.baseline,
    isSaved: true,
    planType: "starter",
  };
}

export function resetLifetimePlanToStarter(
  userId: string,
  currentNetWorthAmount: number,
): LifetimePlanSnapshot {
  const starter = starterLifetimePlanSnapshot(currentNetWorthAmount);
  writeLifetimePlanSnapshot(userId, starter);
  return starter;
}

export function loadInitialLifetimePlan(
  userId: string,
  currentNetWorthAmount: number,
): {
  assumptions: LifetimeProjectionAssumptions;
  baseline: LifetimePlanBaseline;
  isSaved: boolean;
  planType: "starter" | "custom";
} {
  return loadOrInstallStarterLifetimePlan(userId, currentNetWorthAmount);
}
