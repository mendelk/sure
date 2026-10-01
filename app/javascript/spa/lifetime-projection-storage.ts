import { z } from "zod";
import {
  createDefaultHousehold,
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS,
  HouseholdSchema,
  LifetimeProjectionAssumptionsSchema,
  ProjectionDebtSchema,
  ProjectionEventSchema,
  ProjectionGoalSchema,
  ProjectionRealAssetSchema,
  type CashFlowMode,
  type Household,
  type LifetimeProjectionAssumptions,
  type ProjectionDebt,
  type ProjectionEvent,
  type ProjectionGoal,
  type ProjectionRealAsset,
} from "./lifetime-projection";

export const STARTER_LIFETIME_PLAN_VERSION = 1;
export const STARTER_LIFETIME_PLAN_ASSUMPTIONS: LifetimeProjectionAssumptions =
  DEFAULT_LIFETIME_PROJECTION_ASSUMPTIONS;

export const LifetimePlanAccountBaselineSchema = z.object({
  id: z.string(),
  name: z.string(),
  balance: z.number(),
  classification: z.enum(["asset", "liability"]),
});

export const LifetimePlanBaselineSchema = z.object({
  netWorth: z.number(),
  capturedAt: z.string(),
  accounts: z.optional(z.array(LifetimePlanAccountBaselineSchema)),
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
  household: z.optional(HouseholdSchema),
  cashFlowMode: z.optional(z.enum(["flat", "events"])),
  events: z.optional(z.array(ProjectionEventSchema)),
  goals: z.optional(z.array(ProjectionGoalSchema)),
  debts: z.optional(z.array(ProjectionDebtSchema)),
  realAssets: z.optional(z.array(ProjectionRealAssetSchema)),
  display: z.optional(LifetimePlanDisplaySchema),
  updatedAt: z.optional(z.string()),
});

export type LifetimePlanAccountBaseline = z.infer<typeof LifetimePlanAccountBaselineSchema>;
export type LifetimePlanBaseline = z.infer<typeof LifetimePlanBaselineSchema>;
export type LifetimePlanDisplay = z.infer<typeof LifetimePlanDisplaySchema>;

export type LifetimePlanSnapshot = {
  version?: number;
  planType?: "starter" | "custom";
  baseline: LifetimePlanBaseline;
  assumptions: LifetimeProjectionAssumptions;
  household?: Household;
  cashFlowMode?: CashFlowMode;
  events?: ProjectionEvent[];
  goals?: ProjectionGoal[];
  debts?: ProjectionDebt[];
  realAssets?: ProjectionRealAsset[];
  display?: LifetimePlanDisplay;
  updatedAt?: string;
};

export type BaselineAccountDiff = {
  id: string;
  name: string;
  status: "added" | "removed" | "changed" | "unchanged";
  oldBalance?: number;
  newBalance?: number;
  delta?: number;
  classification: "asset" | "liability";
};

export type BaselineDiff = {
  hasDiff: boolean;
  capturedAt: string;
  baselineNetWorth: number;
  currentNetWorth: number;
  netWorthDelta: number;
  additions: BaselineAccountDiff[];
  removals: BaselineAccountDiff[];
  changes: BaselineAccountDiff[];
  unchanged: BaselineAccountDiff[];
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

    const validatedHousehold =
      result.data.household !== undefined
        ? HouseholdSchema.safeParse(result.data.household)
        : undefined;

    const household =
      validatedHousehold?.success === true
        ? validatedHousehold.data
        : createDefaultHousehold(new Date().getFullYear());

    const validatedEvents =
      result.data.events !== undefined
        ? z.array(ProjectionEventSchema).safeParse(result.data.events)
        : undefined;

    const events = validatedEvents?.success === true ? validatedEvents.data : [];
    const cashFlowMode = result.data.cashFlowMode ?? "flat";

    const validatedGoals =
      result.data.goals !== undefined
        ? z.array(ProjectionGoalSchema).safeParse(result.data.goals)
        : undefined;

    const goals = validatedGoals?.success === true ? validatedGoals.data : [];

    const validatedDebts =
      result.data.debts !== undefined
        ? z.array(ProjectionDebtSchema).safeParse(result.data.debts)
        : undefined;

    const debts = validatedDebts?.success === true ? validatedDebts.data : [];

    const validatedRealAssets =
      result.data.realAssets !== undefined
        ? z.array(ProjectionRealAssetSchema).safeParse(result.data.realAssets)
        : undefined;

    const realAssets = validatedRealAssets?.success === true ? validatedRealAssets.data : [];

    return {
      version: result.data.version ?? STARTER_LIFETIME_PLAN_VERSION,
      planType: result.data.planType ?? "custom",
      baseline: result.data.baseline,
      assumptions: validatedAssumptions.data,
      household,
      cashFlowMode,
      events,
      goals,
      debts,
      realAssets,
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

export function starterLifetimePlanSnapshot(
  startingNetWorth: number,
  accounts?: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
  startYear = new Date().getFullYear(),
): LifetimePlanSnapshot {
  return {
    version: STARTER_LIFETIME_PLAN_VERSION,
    planType: "starter",
    baseline: {
      netWorth: startingNetWorth,
      capturedAt: new Date().toISOString(),
      accounts: accounts?.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance_amount,
        classification: a.classification,
      })),
    },
    assumptions: STARTER_LIFETIME_PLAN_ASSUMPTIONS,
    household: createDefaultHousehold(startYear),
    cashFlowMode: "flat",
    events: [],
    goals: [],
    debts: [],
    realAssets: [],
    updatedAt: new Date().toISOString(),
  };
}

// Create the starter only when no user plan exists in local storage.
// Never overwrite a locally edited plan during an application update or reload.
export function loadOrInstallStarterLifetimePlan(
  userId: string,
  currentNetWorthAmount: number,
  currentAccounts?: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
  startYear = new Date().getFullYear(),
): {
  assumptions: LifetimeProjectionAssumptions;
  baseline: LifetimePlanBaseline;
  household: Household;
  cashFlowMode: CashFlowMode;
  events: ProjectionEvent[];
  goals: ProjectionGoal[];
  debts: ProjectionDebt[];
  realAssets: ProjectionRealAsset[];
  isSaved: boolean;
  planType: "starter" | "custom";
} {
  const existing = readLifetimePlanSnapshot(userId);
  if (existing !== undefined) {
    return {
      assumptions: existing.assumptions,
      baseline: existing.baseline,
      household: existing.household ?? createDefaultHousehold(startYear),
      cashFlowMode: existing.cashFlowMode ?? "flat",
      events: existing.events ?? [],
      goals: existing.goals ?? [],
      debts: existing.debts ?? [],
      realAssets: existing.realAssets ?? [],
      isSaved: true,
      planType: existing.planType ?? "custom",
    };
  }

  const starter = starterLifetimePlanSnapshot(currentNetWorthAmount, currentAccounts, startYear);
  writeLifetimePlanSnapshot(userId, starter);

  return {
    assumptions: starter.assumptions,
    baseline: starter.baseline,
    household: starter.household ?? createDefaultHousehold(startYear),
    cashFlowMode: starter.cashFlowMode ?? "flat",
    events: starter.events ?? [],
    goals: starter.goals ?? [],
    debts: starter.debts ?? [],
    realAssets: starter.realAssets ?? [],
    isSaved: true,
    planType: "starter",
  };
}

export function resetLifetimePlanToStarter(
  userId: string,
  currentNetWorthAmount: number,
  currentAccounts?: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
  startYear = new Date().getFullYear(),
): LifetimePlanSnapshot {
  const starter = starterLifetimePlanSnapshot(currentNetWorthAmount, currentAccounts, startYear);
  writeLifetimePlanSnapshot(userId, starter);
  return starter;
}

export function refreshLifetimePlanBaseline(
  userId: string,
  currentNetWorth: number,
  currentAccounts?: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
): LifetimePlanSnapshot | undefined {
  const existing = readLifetimePlanSnapshot(userId);
  if (existing === undefined) return undefined;

  const updated: LifetimePlanSnapshot = {
    ...existing,
    baseline: {
      netWorth: currentNetWorth,
      capturedAt: new Date().toISOString(),
      accounts: currentAccounts?.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance_amount,
        classification: a.classification,
      })),
    },
    updatedAt: new Date().toISOString(),
  };

  writeLifetimePlanSnapshot(userId, updated);
  return updated;
}

export function computeBaselineDiff(
  baseline: LifetimePlanBaseline,
  currentNetWorth: number,
  currentAccounts: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
): BaselineDiff {
  const netWorthDelta = currentNetWorth - baseline.netWorth;
  const additions: BaselineAccountDiff[] = [];
  const removals: BaselineAccountDiff[] = [];
  const changes: BaselineAccountDiff[] = [];
  const unchanged: BaselineAccountDiff[] = [];

  const baselineAccounts = baseline.accounts;

  if (baselineAccounts !== undefined && baselineAccounts.length > 0) {
    const baselineMap = new Map(baselineAccounts.map((a) => [a.id, a]));
    const currentMap = new Map(currentAccounts.map((a) => [a.id, a]));

    for (const currentAccount of currentAccounts) {
      const oldAccount = baselineMap.get(currentAccount.id);
      if (oldAccount === undefined) {
        additions.push({
          id: currentAccount.id,
          name: currentAccount.name,
          status: "added",
          newBalance: currentAccount.balance_amount,
          classification: currentAccount.classification,
        });
      } else {
        const delta = currentAccount.balance_amount - oldAccount.balance;
        if (Math.abs(delta) > 0.001 || currentAccount.name !== oldAccount.name) {
          changes.push({
            id: currentAccount.id,
            name: currentAccount.name,
            status: "changed",
            oldBalance: oldAccount.balance,
            newBalance: currentAccount.balance_amount,
            delta,
            classification: currentAccount.classification,
          });
        } else {
          unchanged.push({
            id: currentAccount.id,
            name: currentAccount.name,
            status: "unchanged",
            oldBalance: oldAccount.balance,
            newBalance: currentAccount.balance_amount,
            classification: currentAccount.classification,
          });
        }
      }
    }

    for (const oldAccount of baselineAccounts) {
      if (!currentMap.has(oldAccount.id)) {
        removals.push({
          id: oldAccount.id,
          name: oldAccount.name,
          status: "removed",
          oldBalance: oldAccount.balance,
          classification: oldAccount.classification,
        });
      }
    }
  } else {
    // When baseline has no account breakdown, check net worth diff
    for (const currentAccount of currentAccounts) {
      unchanged.push({
        id: currentAccount.id,
        name: currentAccount.name,
        status: "unchanged",
        newBalance: currentAccount.balance_amount,
        classification: currentAccount.classification,
      });
    }
  }

  const hasDiff =
    Math.abs(netWorthDelta) > 0.001 ||
    additions.length > 0 ||
    removals.length > 0 ||
    changes.length > 0;

  return {
    hasDiff,
    capturedAt: baseline.capturedAt,
    baselineNetWorth: baseline.netWorth,
    currentNetWorth,
    netWorthDelta,
    additions,
    removals,
    changes,
    unchanged,
  };
}

export function formatBaselineDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "Previously";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "Previously";
  }
}

export function loadInitialLifetimePlan(
  userId: string,
  currentNetWorthAmount: number,
  currentAccounts?: Array<{
    id: string;
    name: string;
    balance_amount: number;
    classification: "asset" | "liability";
  }>,
  startYear = new Date().getFullYear(),
): {
  assumptions: LifetimeProjectionAssumptions;
  baseline: LifetimePlanBaseline;
  household: Household;
  cashFlowMode: CashFlowMode;
  events: ProjectionEvent[];
  goals: ProjectionGoal[];
  debts: ProjectionDebt[];
  realAssets: ProjectionRealAsset[];
  isSaved: boolean;
  planType: "starter" | "custom";
} {
  return loadOrInstallStarterLifetimePlan(
    userId,
    currentNetWorthAmount,
    currentAccounts,
    startYear,
  );
}
