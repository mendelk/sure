---
pm-task: true
projectId: "p_lfp_13"
parentId: "t_lfp_1202"
id: "t_lfp_1202_3"
title: "Enforce cross-output equivalence invariants"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "invariants", "reports"]
subtaskIds: []
dependencies: ["t_lfp_1202_2"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Prove that presentation, export, API, comparison, and stochastic wrappers preserve the same underlying financial result.

## Acceptance criteria
- Real/nominal and currency views round-trip within defined precision.
- Web, API, CSV, JSON, PDF, compare, and progress values reconcile to canonical metrics.
- Every stochastic trial uses the deterministic calculation contract for its sampled inputs.

## Verification
- Run cross-format and cross-surface comparisons for all reference plan families.

Project: [[13 Validation and Rollout]]
