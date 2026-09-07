---
pm-task: true
projectId: "p_lfp_13"
parentId: null
id: "t_lfp_1202"
title: "Validate cross-feature financial invariants"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "invariants"]
subtaskIds: ["t_lfp_1202_1", "t_lfp_1202_2", "t_lfp_1202_3"]
dependencies: ["t_lfp_1201", "t_lfp_705", "t_lfp_905", "t_lfp_1006"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Continuously prove conservation, ownership, tax, timing, and metric invariants across interacting planning capabilities.

## Acceptance criteria
- Annual starting value plus net flows plus market change equals ending value for every account and household rollup.
- Internal transfers net to zero; taxes, withholding, refunds, gains, contributions, withdrawals, debt principal, and spending are counted exactly once.
- Person/joint ownership totals reconcile before and after marriage, relocation, and death.
- Real/nominal outputs, currency conversion, compare deltas, progress overlays, and exports preserve equivalent underlying results.
- Optimization and stochastic runs use the same per-trial financial rules as deterministic runs.

## Verification
- Property-based and scenario tests exercise feature combinations, not only isolated calculators.

Project: [[13 Validation and Rollout]]
