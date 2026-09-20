---
pm-task: true
projectId: "[[05 Risk Analytics and Guidance Experiments|05 Risk Analytics and Guidance Experiments]]"
parentId:
id: t_lfp_risk_002
title: Run historical return backtests
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - backtest
  - investments
subtaskIds: []
dependencies:
  - "[[deliver-yearly-summary-and-plan-analytics|Deliver yearly summary and plan analytics]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:54.414Z
timeEstimate: 10
---

Show how the same accepted plan behaves across real historical return sequences.

## Ownership boundary
Add bounded local backtests for supported allocations; do not create asynchronous simulation infrastructure.

## Acceptance criteria
- Run rolling historical periods from an identified data set and preserve the plan assumptions unchanged.
- Show ending outcomes, depletion years, milestone timing, and the worst sequences.
- Let users inspect one trial through the normal yearly ledger and reports.
- State data coverage, inflation basis, fees, and survivorship limitations.

## Verification
- Run a fixed reference plan across known historical windows and reproduce a selected trial exactly.

Project: [[05 Risk Analytics and Guidance Experiments]]
