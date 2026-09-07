---
pm-task: true
projectId: "p_lfp_09"
parentId: "t_lfp_801"
id: "t_lfp_801_1"
title: "Define core planning metric registry"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "metrics"]
subtaskIds: []
dependencies: []
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define canonical names, formulas, units, aggregations, dimensions, and real/nominal behavior for standard planning metrics.

## Acceptance criteria
- Registry covers net worth, liquidity, income, spending, savings, taxes, contributions, withdrawals, debt, allocation, and withdrawal rate.
- Every metric identifies valid person/account/category/tax/event breakdowns.
- All result surfaces and API contracts reference the same definitions.

## Verification
- Recompute every metric from a known yearly ledger without view-specific logic.

Project: [[09 Analytics Reports and Progress]]
