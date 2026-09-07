---
pm-task: true
projectId: "p_lfp_08"
parentId: "t_lfp_705"
id: "t_lfp_705_2"
title: "Generate and evaluate tax-strategy candidates"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["optimization", "tax", "simulation"]
subtaskIds: []
dependencies: ["t_lfp_705_1"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Generate combinations of Roth conversion, gain harvesting, and withdrawal shielding and score them through complete plan simulations.

## Acceptance criteria
- Candidate actions respect tax, account, ownership, conversion, and liquidity rules every year.
- Search is bounded, reproducible, cancellable, and records why candidates were rejected.
- Scores include objective result, constraint violations, and relevant lifetime tradeoffs.

## Verification
- Compare search results with exhaustive results for small bounded examples.

Project: [[08 Scenarios Risk and Optimization]]
