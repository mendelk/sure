---
pm-task: true
projectId: "p_lfp_04"
parentId: null
id: "t_lfp_303"
title: "Support transfers, routing, and multi-account funding"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["cash-flow", "transfers"]
subtaskIds: []
dependencies: ["t_lfp_301", "t_lfp_102"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Move simulated money intentionally between accounts and route events without misclassifying internal transfers as income or spending.

## Acceptance criteria
- Transfer flows support amount/frequency/time bindings, source and destination accounts, and automatic, taxable, or tax-exempt handling.
- In-plan conversions and rollovers receive account-aware tax treatment; external gifts or destinations are represented as money leaving the plan.
- Income and sale proceeds can split across multiple accounts or route directly to a financed-asset loan.
- Expenses can draw from an ordered set of specific accounts and continue to normal drawdown only when configured.
- Transfers preserve conservation of money and remain distinct from contributions, withdrawals, and spending metrics.

## Verification
- Cover brokerage-to-cash, IRA conversion, gift, multi-account education expense, split direct deposit, and loan payoff routing.

Project: [[04 Cash Flow Goals and Debt]]
