---
pm-task: true
projectId: "p_lfp_05"
parentId: "t_lfp_401"
id: "t_lfp_401_1"
title: "Specify simulation processing order"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "ledger"]
subtaskIds: []
dependencies: []
timeEstimate: 16
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define the authoritative order for opening balances, events, withholding, flows, transfers, debt, tax accrual, growth, drawdown, reconciliation, and closing balances.

## Acceptance criteria
- Ordering and same-period precedence are documented for every supported operation.
- Circular dependencies and values requiring iterative resolution have deterministic rules.
- Representative ordering examples receive finance-domain review.

## Verification
- Golden examples demonstrate that changing input order does not accidentally change economic behavior.

Project: [[05 Deterministic Simulation Engine]]
