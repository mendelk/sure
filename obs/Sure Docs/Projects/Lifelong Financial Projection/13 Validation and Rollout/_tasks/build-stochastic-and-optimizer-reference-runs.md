---
pm-task: true
projectId: "p_lfp_13"
parentId: "t_lfp_1201"
id: "t_lfp_1201_3"
title: "Build stochastic and optimizer reference runs"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "monte-carlo", "optimization"]
subtaskIds: []
dependencies: ["t_lfp_1201_2"]
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Create seeded historical, Monte Carlo, chance-of-success, flex-spending, and tax-optimization reference runs.

## Acceptance criteria
- Manifests preserve dataset, ruleset, seed, distributions, constraints, and expected aggregate structure.
- Small runs have exact trial-level expectations; large runs use justified statistical tolerances.
- Optimizer fixtures include known exhaustive optima for bounded cases.

## Verification
- Repeated execution stays within exact or documented statistical expectations.

Project: [[13 Validation and Rollout]]
