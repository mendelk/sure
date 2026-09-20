---
pm-task: true
projectId: "[[08 Scenarios Risk and Optimization|08 Scenarios Risk and Optimization]]"
parentId:
id: t_lfp_703
title: Run configurable Monte Carlo simulations
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - monte-carlo
subtaskIds:
  - "[[configure-stochastic-sampling-and-distributions|Configure stochastic sampling and distributions]]"
  - "[[execute-reproducible-monte-carlo-batches|Execute reproducible Monte Carlo batches]]"
  - "[[manage-asynchronous-simulation-lifecycle|Manage asynchronous simulation lifecycle]]"
dependencies:
  - "[[run-historical-backtests|Run historical backtests]]"
  - "[[make-simulation-results-auditable-and-repeatable|Make simulation results auditable and repeatable]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
