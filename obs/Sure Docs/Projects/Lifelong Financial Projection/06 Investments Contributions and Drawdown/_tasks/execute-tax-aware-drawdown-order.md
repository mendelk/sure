---
pm-task: true
projectId: "[[06 Investments Contributions and Drawdown|06 Investments Contributions and Drawdown]]"
parentId: "[[implement-account-liquidity-and-drawdown-order|Implement account liquidity and drawdown order]]"
id: t_lfp_504_2
title: Execute tax-aware drawdown order
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - drawdown
  - tax
subtaskIds: []
dependencies:
  - "[[configure-account-access-and-liquidity|Configure account access and liquidity]]"
timeEstimate: 32
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Fund shortfalls from ranked eligible accounts while accounting for taxes, basis, withholding, ownership, and gross-up needs.

## Acceptance criteria
- Users can rank account types, individual accounts, and eligible real assets.
- Withdrawals iterate until net cash need is met or all eligible liquidity is exhausted.
- Couple income and ownership are allocated consistently under joint and separate filing.

## Verification
- Reconcile taxable-first, tax-deferred-first, mixed-basis, and couple drawdown examples.

Project: [[06 Investments Contributions and Drawdown]]
