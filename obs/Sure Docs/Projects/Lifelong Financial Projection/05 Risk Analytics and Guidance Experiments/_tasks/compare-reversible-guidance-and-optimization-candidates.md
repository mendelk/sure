---
pm-task: true
projectId: "[[05 Risk Analytics and Guidance Experiments|05 Risk Analytics and Guidance Experiments]]"
parentId:
id: t_lfp_risk_005
title: Compare reversible guidance and optimization candidates
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - guidance
  - optimization
  - scenarios
subtaskIds: []
dependencies:
  - "[[explain-chance-of-success-and-outcome-bands|Explain chance of success and outcome bands]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:58.152Z
timeEstimate: 12
---

Turn observed plan weaknesses into transparent alternatives without silently rewriting the plan.

## Ownership boundary
Generate bounded candidate scenarios for accepted levers; do not build a generic solver before users review the suggestions.

## Acceptance criteria
- Generate candidates for retirement timing, spending, savings, allocation, drawdown, claiming, and supported tax strategies.
- State the objective, constraints, changed assumptions, tradeoffs, and why each candidate ranked where it did.
- Apply a candidate only by creating or changing a reversible local scenario.
- Compare deterministic, historical, stochastic, tax, and legacy effects before acceptance.

## Verification
- Generate candidates for a constrained reference plan, inspect rejected constraints, apply one, undo it, and reproduce the ranking.

Project: [[05 Risk Analytics and Guidance Experiments]]
