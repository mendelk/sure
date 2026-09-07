---
pm-task: true
projectId: "p_lfp_05"
parentId: null
id: "t_lfp_405"
title: "Make simulation results auditable and repeatable"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "audit", "performance"]
subtaskIds: []
dependencies: ["t_lfp_401", "t_lfp_403", "t_lfp_404", "t_lfp_005"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Expose enough structured detail to explain any result and rerun large plans reliably as inputs change.

## Acceptance criteria
- Results retain yearly line items, applied assumptions, milestone resolutions, warnings, taxes, limits, and account balances.
- A user can trace a metric to its component ledger entries and the rule that produced each derived amount.
- Results become stale when relevant inputs or rules change and never imply freshness based only on cached output.
- Identical deterministic manifests yield identical results; failed runs do not replace the last valid result.
- Performance targets cover long plans, large households, detailed events, and concurrent simulations without sacrificing correctness.

## Verification
- Golden runs, replay tests, stale-result tests, and load tests validate the complete calculation contract.

Project: [[05 Deterministic Simulation Engine]]
