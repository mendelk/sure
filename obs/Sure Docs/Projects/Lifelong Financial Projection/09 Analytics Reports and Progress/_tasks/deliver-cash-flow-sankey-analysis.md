---
pm-task: true
projectId: "p_lfp_09"
parentId: null
id: "t_lfp_802"
title: "Deliver cash-flow Sankey analysis"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "cash-flow"]
subtaskIds: []
dependencies: ["t_lfp_801", "t_lfp_301", "t_lfp_303"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Provide an annual flow-of-funds analysis that explains where money came from and where it went.

## Acceptance criteria
- Nodes distinguish gross income, withholding, refunds/payments, contributions, transfers, withdrawals, expenses, debt, gifts, taxes, and ending cash.
- Internal transfers do not inflate income or expense totals and account names remain traceable beneath grouped flows.
- Expense outflows can group/color by meaningful category while retaining exact line-item drill-down.
- Users can step across years and notable events, including accumulation, retirement, conversion, and estate phases.
- Every displayed edge reconciles to the annual ledger and accessible tabular data.

## Verification
- Sankey totals reconcile for earned-income, retirement-drawdown, Roth conversion, debt payoff, and tax-refund years.

Project: [[09 Analytics Reports and Progress]]
