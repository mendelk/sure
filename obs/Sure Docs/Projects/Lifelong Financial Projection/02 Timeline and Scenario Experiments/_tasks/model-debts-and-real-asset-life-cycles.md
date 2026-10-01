---
pm-task: true
projectId: "[[02 Timeline and Scenario Experiments|02 Timeline and Scenario Experiments]]"
parentId:
id: t_lfp_timeline_004
title: Model debts and real asset life cycles
type: task
status: in-progress
priority: high
start: "2026-09-22"
due: ""
progress: 10
assignees: []
tags:
  - debt
  - property
  - events
subtaskIds: []
dependencies:
  - "[[schedule-income-and-spending-events|Schedule income and spending events]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:48.755Z
timeEstimate: 10
---

Show how loans, homes, vehicles, purchases, sales, and payoff dates alter the same working plan.

## Ownership boundary
Add focused local behaviors for existing Sure account types; do not complete an exhaustive account taxonomy.

## Acceptance criteria
- Project principal, interest, scheduled payments, payoff, and optional extra payments for debts.
- Represent a real-asset purchase, appreciation or depreciation, carrying costs, and sale proceeds.
- Keep asset value, debt balance, and cash-flow effects separately explainable.
- Handle sale-before-payoff and plan-end balances visibly.

## Verification
- Run mortgage payoff, early payoff, home purchase/sale, and depreciating vehicle examples through the live result.

### Implementation checkpoint
- Local plan snapshots include debts and real assets; older plans load empty collections.
- Add, edit, disable, and delete controls update the projection and saved browser plan. Reset clears these collections; baseline refresh preserves them.
- Annual breakdowns separate liquid portfolio, asset value, debt balance, payments, carrying costs, purchases, and sales. Net-worth reconciliation includes sale proceeds and changes in real equity.
- Smoke scenarios: a $320,000 mortgage at 5% over 25 years pays off in 2051; $12,000 extra annual payments move payoff to 2039. A financed $450,000 home purchase uses $130,000 cash and its sale clears the remaining mortgage. A $35,000 vehicle depreciating 15% reaches $29,750 after one year.
- Browser verification used the real projection components with a seeded summary in a temporary Vite harness: example prefill, debt/asset creation and deletion, editing, toggling, reload persistence, and sale-before-payoff breakdown.

Project: [[02 Timeline and Scenario Experiments]]
