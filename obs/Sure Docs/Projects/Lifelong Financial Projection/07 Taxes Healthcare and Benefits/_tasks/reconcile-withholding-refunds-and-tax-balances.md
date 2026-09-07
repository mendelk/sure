---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_604"
title: "Reconcile withholding, refunds, and tax balances"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "cash-flow"]
subtaskIds: []
dependencies: ["t_lfp_601", "t_lfp_202", "t_lfp_401"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Separate accrued tax liability from cash remitted during the year and reconcile the difference in the following period.

## Acceptance criteria
- Income and taxable account operations support automatic heuristic, fixed-rate, and no-withholding modes.
- Total liability is calculated after year-end activity, compared with remittance, and produces next-year payment or refund flows.
- The tax balance reports current liability, current remittance, prior-year true-up, ACA reconciliation, and net cash effect.
- First-year plans can record known prior-year payments/refunds without manufacturing prior simulation history.
- Withholding does not change total tax liability and reports consistently in cash-flow and tax analytics.

## Verification
- Fixtures cover under/over-withholding, no withholding, automatic withholding, first-year payment, and ACA credit reconciliation.

Project: [[07 Taxes Healthcare and Benefits]]
