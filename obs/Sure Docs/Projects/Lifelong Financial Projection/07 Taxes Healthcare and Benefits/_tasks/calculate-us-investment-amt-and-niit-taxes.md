---
pm-task: true
projectId: "[[07 Taxes Healthcare and Benefits|07 Taxes Healthcare and Benefits]]"
parentId: "[[implement-us-income-and-payroll-taxes|Implement US income and payroll taxes]]"
id: t_lfp_602_2
title: Calculate US investment, AMT, and NIIT taxes
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - tax
  - us
  - investments
subtaskIds: []
dependencies:
  - "[[calculate-us-federal-ordinary-and-payroll-taxes|Calculate US federal ordinary and payroll taxes]]"
timeEstimate: 28
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Calculate long/short capital gains, qualified dividends, Net Investment Income Tax, and Alternative Minimum Tax interactions.

## Acceptance criteria
- Preferential income stacks correctly on ordinary taxable income.
- NIIT and AMT use tax-year thresholds and applicable income adjustments.
- Gain/loss basis and carryforward inputs reconcile to account activity.

## Verification
- Test bracket crossings, mixed gains/dividends, NIIT threshold, AMT crossover, and capital losses.

Project: [[07 Taxes Healthcare and Benefits]]
