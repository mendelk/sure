---
pm-task: true
projectId: "p_lfp_01"
parentId: null
id: "t_lfp_004"
title: "Define calculation versioning and reproducibility"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["architecture", "simulation", "audit"]
subtaskIds: []
dependencies: ["t_lfp_002"]
timeEstimate: 16
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define the immutable input manifest required to reproduce a projection after tax tables, market datasets, defaults, and simulation logic evolve.

## Acceptance criteria
- Every result identifies plan revision, engine version, ruleset versions, historical dataset version, currency rates, seed, and run configuration.
- Reopening an old result distinguishes exact replay, replay with updated rules, and rerun from latest current finances.
- Plan edits create traceable revisions and support comparison or restoration without ambiguous partial state.
- Deterministic, historical, and stochastic runs share a common provenance contract.
- Data retention and deletion behavior are defined for inputs, cached results, exports, imports, and household-shared plans.

## Verification
- The same manifest produces materially identical outputs, including seeded Monte Carlo trials, on repeated runs.

Project: [[01 Product Definition and Architecture]]
