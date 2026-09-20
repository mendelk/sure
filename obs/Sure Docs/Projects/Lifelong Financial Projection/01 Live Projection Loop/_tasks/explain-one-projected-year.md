---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_004
title: Explain one projected year
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - explainability
  - ledger
  - frontend
subtaskIds: []
dependencies:
  - "[[remember-one-plan-in-local-storage|Remember one plan in local storage]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:48.782Z
timeEstimate: 8
---

Let a user inspect how one year moved from its starting value to its ending value before the calculation grows more sophisticated.

## Ownership boundary
Add a feature-local year breakdown to the live result. Do not build a general ledger engine yet.

## Acceptance criteria
- Show starting value, income, spending, investment growth, inflation effect, and ending value for a selected year.
- Make the displayed components reconcile exactly to the displayed ending value.
- Explain negative balances and depleted plans rather than hiding or clamping them.
- Use the same calculation result as the chart and table rather than recomputing display-only numbers.

## Verification
- Select early, middle, depleted, and final years on the actual route and manually reconcile the displayed components.

Project: [[01 Live Projection Loop]]
