---
pm-task: true
projectId: "p_lfp_08"
parentId: null
id: "t_lfp_703"
title: "Run configurable Monte Carlo simulations"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["risk", "monte-carlo"]
subtaskIds: ["t_lfp_703_1", "t_lfp_703_2", "t_lfp_703_3"]
dependencies: ["t_lfp_702", "t_lfp_405"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Run many complete plan simulations using historical sampling or custom probability distributions for uncertain assumptions.

## Acceptance criteria
- Configuration controls trial count, seed, sampling method, distributions, correlations, and which account assumptions remain fixed or variable.
- Returns, dividends, bond returns, and inflation can use validated custom distributions; impossible values such as loss below -100% are constrained.
- Accounts using shared custom return assumptions move as an explicitly correlated group rather than independently by accident.
- Runs become stale and optionally rerun when relevant plan variables change.
- Large runs are cancellable, resumable where practical, isolated by household, and never expose partial results as complete.

## Verification
- Seeded runs repeat exactly; distribution, correlation, cancellation, staleness, and high-trial-count tests pass.

Project: [[08 Scenarios Risk and Optimization]]
