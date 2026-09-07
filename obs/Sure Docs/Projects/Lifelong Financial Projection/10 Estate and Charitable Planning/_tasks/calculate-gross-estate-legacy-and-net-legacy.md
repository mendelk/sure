---
pm-task: true
projectId: "p_lfp_10"
parentId: null
id: "t_lfp_902"
title: "Calculate gross estate, legacy, and net legacy"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["estate", "metrics"]
subtaskIds: []
dependencies: ["t_lfp_901", "t_lfp_504", "t_lfp_604"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Calculate what remains at plan end from gross assets through obligations to the amount available for heirs and charity.

## Acceptance criteria
- Gross estate, debt, final tax balance, account income taxes, embedded gains taxes, liquidation costs, administrative costs, estate taxes, legacy, and net legacy are separate values.
- Estate composition remains available by account, asset type, ownership, tax treatment, and beneficiary destination.
- Configurable assumptions include inherited tax-deferred rate, taxable-account gain rate when no step-up applies, liquidation cost, administration percentage, and charitable share.
- Net legacy equals the complete distributable pool; charity and heirs are terminal allocations from that pool.
- Estate results are available in plan, compare, tax analytics, chance-of-success, and strategy analysis.

## Verification
- A full estate flow reconciles gross assets to heirs plus charity with every reduction accounted for exactly once.

Project: [[10 Estate and Charitable Planning]]
