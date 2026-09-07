---
pm-task: true
projectId: "p_lfp_13"
parentId: "t_lfp_1202"
id: "t_lfp_1202_1"
title: "Enforce ledger conservation invariants"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "invariants", "ledger"]
subtaskIds: []
dependencies: []
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Enforce account and household equations and exactly-once classification across generated plans.

## Acceptance criteria
- Starting value plus flows and market change always equals ending value.
- Internal transfers net to zero and no economic amount is counted twice.
- Property-based tests shrink failures to explainable minimal plans.

## Verification
- Run invariants across randomized account, flow, tax, debt, and drawdown combinations.

Project: [[13 Validation and Rollout]]
