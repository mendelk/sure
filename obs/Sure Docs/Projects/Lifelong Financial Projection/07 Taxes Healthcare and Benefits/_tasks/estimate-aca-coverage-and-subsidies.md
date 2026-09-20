---
pm-task: true
projectId: "[[07 Taxes Healthcare and Benefits|07 Taxes Healthcare and Benefits]]"
parentId:
id: t_lfp_606
title: Estimate ACA coverage and subsidies
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - healthcare
  - tax
  - us
subtaskIds: []
dependencies:
  - "[[build-jurisdiction-aware-tax-engine|Build jurisdiction-aware tax engine]]"
  - "[[model-expense-and-giving-events|Model expense and giving events]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
timeEstimate: 36
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Estimate Marketplace premiums and premium tax credits before Medicare eligibility.

## Acceptance criteria
- Healthcare expenses can identify ACA Marketplace coverage, household members, benchmark premium assumptions, and coverage months.
- Premium growth can differ from general inflation and begin growing today even when coverage starts later.
- Subsidies use household size, location, MAGI, Federal Poverty Level rules, and applicable-year legislation.
- Advance credits reconcile against final-year eligibility through the tax balance.
- Results expose gross premiums, subsidy, net premium, MAGI/FPL ratio, and cliff or phaseout effects.

## Verification
- Test household-size changes, mid-year coverage, income changes, subsidy reconciliation, and Medicare transition.

Project: [[07 Taxes Healthcare and Benefits]]
