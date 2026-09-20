---
pm-task: true
projectId: "[[05 Deterministic Simulation Engine|05 Deterministic Simulation Engine]]"
parentId: "[[implement-the-annual-simulation-ledger|Implement the annual simulation ledger]]"
id: t_lfp_401_3
title: Resolve shortfall, liquidity, and insolvency
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - simulation
  - solvency
subtaskIds: []
dependencies:
  - "[[calculate-balanced-yearly-account-ledger|Calculate balanced yearly account ledger]]"
timeEstimate: 20
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Represent obligations that cannot be funded even when the household still owns illiquid or inaccessible assets.

## Acceptance criteria
- Unfunded amount, first failure date, responsible obligation, and inaccessible resources are recorded.
- Negative balances occur only where the account model permits borrowing or overdraft.
- Terminal behavior distinguishes temporary shortfall, forced liquidation, insolvency, and recovered plans.

## Verification
- Cover no-cash/valuable-home, locked retirement funds, excessive debt, and later-recovery scenarios.

Project: [[05 Deterministic Simulation Engine]]
