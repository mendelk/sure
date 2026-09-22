---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_007
title: Review the first live projection slice
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - product-review
  - checkpoint
  - projection
subtaskIds: []
dependencies:
  - "[[refresh-the-local-baseline-from-current-finances|Refresh the local baseline from current finances]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-22T02:14:00.000Z
timeEstimate: 4
---

Choose what to keep from the first working projection before adding more planning concepts.

## Ownership boundary
Own the browser review and concrete keep/change/delete decisions. Do not preserve rejected behavior behind flags.

## Acceptance criteria
- Review baseline refresh, assumption editing, yearly results, explanation, starter behavior, and local restore on the actual route.
- Mark each part keep, change, or delete and record the simplest accepted first slice.
- Identify the smallest local plan fields and calculation inputs demonstrated by working behavior.
- List confusing financial language or safety gaps that must be fixed before expansion.

## Review Decisions (Keep / Change / Delete)

### 1. Baseline Refresh
- **Decision:** **KEEP**
- **Rationale:** The explicit review modal (`ProjectionBaselineRefreshModal`) displaying added, removed, and changed accounts with net worth delta cleanly separates live Sure balance syncs from user planning scenarios.
- **Accepted slice:** Preview additions, removals, balance changes, and delta. Let users reject (keep saved baseline) or accept (update baseline while preserving all scenario assumptions).

### 2. Core Assumption Editing
- **Decision:** **KEEP**
- **Rationale:** The 5 core parameters (`horizonYears`, `annualIncome`, `annualSpending`, `inflationPercent`, `annualReturnPercent`) with helper tokens ("today's dollars", "% / year") and instant recalculation provide an intuitive playground without page reloads.
- **Accepted slice:** Retain current form fields, inline validation alerts, and "You have unapplied assumption changes" indicator.

### 3. Year-by-Year Results (Chart & Table)
- **Decision:** **KEEP**
- **Rationale:** The visual chart trajectory and interactive table sharing the exact same calculation output provide immediate clarity. Selecting rows in the table to drive the explanation breakdown works smoothly.
- **Accepted slice:** Chart, table, active row indicator dot, and sticky/compact column alignment.

### 4. Year Explanation & Ledger Reconciliation
- **Decision:** **KEEP**
- **Rationale:** Explaining a single year via starting value, investment growth, base/inflated income, base/inflated spending, and ending value with the exact formula `Starting value + Investment growth + Annual income − Annual spending = Ending value` demystifies the projection.
- **Accepted slice:** 6-component breakdown card, stepper navigation, dropdown selector, and depleted plan alert.

### 5. Starter Plan & Reset Flow
- **Decision:** **KEEP**
- **Rationale:** Deterministic starter plan ($80k income, $60k spending, 2.5% inflation, 5% return, 30-year horizon) created only when no plan exists. Confirmation dialog (`ProjectionResetDialog`) explains what will be replaced before resetting.
- **Accepted slice:** Retain starter initialization, confirmation modal, and cancel/confirm reset flow.

### 6. Empty Family / Zero Accounts Handling
- **Decision:** **CHANGE (To be implemented in Task 8)**
- **Rationale:** Currently, if a user has zero accounts, `ProjectionEmptyState` blocks the route entirely and tells them to add accounts. Users should be able to explore the lifetime projection even with an empty family by starting with a $0 baseline starter plan.
- **Action for Task 8:** Update the route so an empty family (0 accounts) loads a starter plan with a $0 baseline, keeping the projection fully usable rather than hard-blocked.

### 7. Smallest Local Plan Schema
- The minimal durable schema verified by working behavior is:
  ```json
  {
    "version": 1,
    "planType": "starter" | "custom",
    "baseline": {
      "netWorth": 0,
      "capturedAt": "ISO-8601",
      "accounts": []
    },
    "assumptions": {
      "horizonYears": 30,
      "annualIncome": 80000,
      "annualSpending": 60000,
      "inflationPercent": 2.5,
      "annualReturnPercent": 5.0
    }
  }
  ```

### 8. Language & Safety Clarity
- **Keep:** "Nominal vs. adjusted" explanation and footer planning disclaimer.
- **Refine:** Ensure depleted plans always show explicit depletion notices and compound debt cleanly without NaN or non-finite math.

## Verification
- Produced concrete decisions from the working browser slice for immediate execution in Task 8 (`refine-the-selected-first-projection`).

Project: [[01 Live Projection Loop]]
