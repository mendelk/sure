---
pm-task: true
projectId: "p_lfp_08"
parentId: "t_lfp_703"
id: "t_lfp_703_2"
title: "Execute reproducible Monte Carlo batches"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["monte-carlo", "simulation"]
subtaskIds: []
dependencies: ["t_lfp_703_1"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Run each generated sequence through the complete deterministic financial model and retain inspectable trial results.

## Acceptance criteria
- Seed and immutable run manifest reproduce every sampled sequence and result.
- Per-trial calculations use the same tax, flow, drawdown, milestone, and estate rules as deterministic runs.
- Invalid random draws and trial-specific failures are constrained or reported without corrupting aggregate results.

## Verification
- Repeat seeded runs and compare selected trial ledgers exactly.

Project: [[08 Scenarios Risk and Optimization]]
