---
pm-task: true
projectId: "p_lfp_08"
parentId: null
id: "t_lfp_705"
title: "Optimize multi-year tax strategies"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["optimization", "tax", "strategies"]
subtaskIds: ["t_lfp_705_1", "t_lfp_705_2", "t_lfp_705_3"]
dependencies: ["t_lfp_607", "t_lfp_605", "t_lfp_606", "t_lfp_704"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Search combinations of Roth conversions, capital-gain harvesting, and withdrawal shielding against user-defined tax and outcome objectives.

## Acceptance criteria
- Strategies can target a federal bracket, IRMAA cliff, ACA/FPL limit, taxable-income or MAGI threshold, and optional ceilings/constraints.
- Opportunistic actions respect account availability, basis, contribution/conversion restrictions, income ownership, filing status, and liquidity.
- Withdrawal shielding shifts marginal withdrawals to eligible tax-free sources after a target is reached.
- Optimization can maximize net worth/net legacy or minimize lifetime taxes, estate drag, premiums, or another supported metric.
- Results compare common/custom strategies, expose target interactions over time, explain tradeoffs, and apply a chosen strategy as a reviewable plan change.

## Verification
- Benchmark strategies around bracket, IRMAA, and ACA cliffs and verify the optimizer never violates configured constraints.

Project: [[08 Scenarios Risk and Optimization]]
