---
pm-task: true
projectId: "p_lfp_08"
parentId: "t_lfp_703"
id: "t_lfp_703_1"
title: "Configure stochastic sampling and distributions"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["monte-carlo", "sampling"]
subtaskIds: []
dependencies: []
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define trial count, seed, sampling method, historical sources, custom distributions, correlations, and account-level fixed/variable behavior.

## Acceptance criteria
- Configuration validates distributions, constraints, units, and incompatible sampling combinations.
- Historical random-year, chronological-window, and block-bootstrap modes preserve intended relationships.
- Shared custom assumptions correlate only the accounts explicitly assigned to them.

## Verification
- Inspect generated sequences and summary moments for every supported mode.

Project: [[08 Scenarios Risk and Optimization]]
