---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_601"
title: "Build jurisdiction-aware tax engine"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "architecture"]
subtaskIds: ["t_lfp_601_1", "t_lfp_601_2", "t_lfp_601_3"]
dependencies: ["t_lfp_401", "t_lfp_101", "t_lfp_102", "t_lfp_004"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Calculate taxes by jurisdiction and tax year from typed income, deductions, credits, filing units, locations, and account activity.

## Acceptance criteria
- National/federal, state/province, and local jurisdictions compose without collapsing their bases, brackets, deductions, or credits.
- Progressive, flat/fixed-rate, capital-gains, payroll, wealth, transaction, property, estate, and custom tax models share a versioned contract.
- Joint and separate filing allocate income, deductions, credits, and withdrawals according to ownership and jurisdiction rules.
- Mid-plan moves and filing-status changes apply the intended tax consequences from the effective period.
- Unsupported locations can use transparent custom brackets/rates without pretending to have official preset fidelity.

## Verification
- Ruleset fixtures prove jurisdiction isolation, annual versioning, moves, separate/joint filing, and custom fallback behavior.

Project: [[07 Taxes Healthcare and Benefits]]
