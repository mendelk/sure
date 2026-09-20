---
pm-task: true
projectId: "[[05 Risk Analytics and Guidance Experiments|05 Risk Analytics and Guidance Experiments]]"
parentId:
id: t_lfp_risk_003
title: Run reproducible Monte Carlo trials
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - monte-carlo
  - simulation
subtaskIds: []
dependencies:
  - "[[run-historical-return-backtests|Run historical return backtests]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:55.630Z
timeEstimate: 12
---

Explore uncertainty without hiding assumptions or turning the first stochastic feature into a distributed system.

## Ownership boundary
Run a bounded batch locally or in an ephemeral request using the accepted deterministic calculation. No stored jobs or database results.

## Acceptance criteria
- Configure trial count, seed, return assumptions, inflation assumptions, and supported correlations.
- Reproduce identical trials from the same plan version, inputs, and seed.
- Keep trial failures and impossible paths visible rather than dropping them from aggregates.
- Inspect any selected trial through the same ledger and explanation as the deterministic plan.

## Verification
- Repeat a seeded batch, compare exact outputs, change one assumption, and inspect best, median, worst, and failed trials.

Project: [[05 Risk Analytics and Guidance Experiments]]
