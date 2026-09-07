---
pm-task: true
projectId: "p_lfp_06"
parentId: null
id: "t_lfp_502"
title: "Model stock-bond allocation and asset location"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "allocation"]
subtaskIds: []
dependencies: ["t_lfp_501"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Model portfolio-wide allocation over time and the tax-aware location of bonds across individual investment accounts.

## Acceptance criteria
- Stock/bond allocation supports fixed targets, age/milestone glide paths, and custom change-over-time curves.
- Bonds can be distributed evenly, prioritized into selected accounts, or overridden with account-specific allocations.
- The engine attempts to satisfy the portfolio target while respecting account balances and overrides, and reports unavoidable drift.
- Rebalancing assumptions, transaction taxes, fees, and account restrictions are explicit.
- Results expose portfolio and per-account allocations for every simulated year.

## Verification
- Cover target allocation, impossible target, account override, drawdown drift, and changing glide-path scenarios.

Project: [[06 Investments Contributions and Drawdown]]
