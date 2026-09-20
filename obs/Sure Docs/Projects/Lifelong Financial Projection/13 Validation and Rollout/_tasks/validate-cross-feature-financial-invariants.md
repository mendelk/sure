---
pm-task: true
projectId: "[[13 Validation and Rollout|13 Validation and Rollout]]"
parentId:
id: t_lfp_1202
title: Validate cross-feature financial invariants
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - quality
  - invariants
subtaskIds:
  - "[[enforce-ledger-conservation-invariants|Enforce ledger conservation invariants]]"
  - "[[enforce-ownership-tax-and-timing-invariants|Enforce ownership, tax, and timing invariants]]"
  - "[[enforce-cross-output-equivalence-invariants|Enforce cross-output equivalence invariants]]"
dependencies:
  - "[[build-reference-scenarios-and-calculation-fixtures|Build reference scenarios and calculation fixtures]]"
  - "[[optimize-multi-year-tax-strategies|Optimize multi-year tax strategies]]"
  - "[[compare-and-optimize-legacy-outcomes|Compare and optimize legacy outcomes]]"
  - "[[operate-a-versioned-annual-rules-update-program|Operate a versioned annual rules-update program]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
