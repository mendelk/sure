---
pm-task: true
projectId: "[[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]"
parentId:
id: t_lfp_tax_005
title: Experiment with tax-advantaged strategies
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - tax-strategy
  - roth
  - retirement
subtaskIds: []
dependencies:
  - "[[add-investment,-deduction,-credit,-and-property-tax-effects|Add investment, deduction, credit, and property tax effects]]"
  - "[[estimate-social-security-and-defined-benefit-income|Estimate Social Security and defined-benefit income]]"
  - "[[estimate-aca,-medicare,-and-irmaa-costs|Estimate ACA, Medicare, and IRMAA costs]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:57.476Z
timeEstimate: 12
---

Let users compare a small set of reversible tax-advantaged actions in real retirement scenarios.

## Ownership boundary
Implement explicit strategy experiments, not a universal optimizer or automatic advice engine.

## Acceptance criteria
- Compare Roth conversions, backdoor and mega-backdoor Roth contributions, and supported 72(t) SEPP withdrawals.
- Show contribution limits, eligibility, taxes, penalties, healthcare interactions, and failed constraints.
- Keep every suggested action opt-in and reversible within the local scenario.
- Report current-year and lifetime tax differences without presenting a guaranteed optimum.

## Verification
- Apply and undo each strategy in representative households and inspect taxes, healthcare costs, balances, and constraint failures.

Project: [[04 Tax Benefit and Healthcare Experiments]]
