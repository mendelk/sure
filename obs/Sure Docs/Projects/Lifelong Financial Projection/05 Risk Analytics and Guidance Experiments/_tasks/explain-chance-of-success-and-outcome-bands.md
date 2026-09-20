---
pm-task: true
projectId: "[[05 Risk Analytics and Guidance Experiments|05 Risk Analytics and Guidance Experiments]]"
parentId:
id: t_lfp_risk_004
title: Explain chance of success and outcome bands
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - success
  - explainability
subtaskIds: []
dependencies:
  - "[[run-reproducible-monte-carlo-trials|Run reproducible Monte Carlo trials]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:57.101Z
timeEstimate: 8
---

Give success percentages concrete, inspectable meaning tied to user-selected outcomes.

## Ownership boundary
Add a small objective editor and distribution views. Do not collapse plan quality into one unexplained score.

## Acceptance criteria
- Define success from selected goals, minimum liquidity, depletion, and legacy outcomes.
- Show percentiles, ranges, milestone timing, and failure reasons alongside the headline percentage.
- Explain denominator choices and include invalid or failed trials appropriately.
- Allow users to inspect representative successful and unsuccessful trials.

## Verification
- Change each objective on a seeded batch and verify the success rate and failure categories against counted trials.

Project: [[05 Risk Analytics and Guidance Experiments]]
