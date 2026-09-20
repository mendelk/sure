---
pm-task: true
projectId: "[[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]"
parentId:
id: t_lfp_flows_003
title: Cover shortfalls with explicit withdrawals
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - withdrawals
  - liquidity
  - shortfall
subtaskIds: []
dependencies:
  - "[[allocate-surplus-across-goals,-debt,-and-accounts|Allocate surplus across goals, debt, and accounts]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:47.695Z
timeEstimate: 10
---

Make retirement and other deficit years draw from actual projected accounts in an understandable order.

## Ownership boundary
Implement one editable drawdown order for supported accounts. Keep penalties and tax estimates simple until the tax phase.

## Acceptance criteria
- Withdraw from liquid accounts in an explicit, user-visible order.
- Respect configurable access ages, minimum cash, and illiquid assets.
- Report penalties, unfunded spending, negative cash, and insolvency as outcomes.
- Show which account funded each shortfall and why the next account was used.

## Verification
- Run liquid, early-access, illiquid, and insolvent examples and inspect the withdrawal explanation.

Project: [[03 Cash Flow and Retirement Experiments]]
