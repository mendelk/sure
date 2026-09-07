---
pm-task: true
projectId: "p_lfp_04"
parentId: null
id: "t_lfp_305"
title: "Model flexible spending behavior"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["cash-flow", "risk", "optimization"]
subtaskIds: []
dependencies: ["t_lfp_203", "t_lfp_301", "t_lfp_205"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Allow planned spending to respond to portfolio performance while protecting obligations users cannot flex.

## Acceptance criteria
- The spending metric is configurable independently from total expenses and can include selected taxes, mortgage, or consumer-debt components.
- Rules adjust all eligible spending or only discretionary spending based on portfolio performance versus prior all-time high.
- Multiple threshold rules support step and linear interpolation and can be active for a milestone-bound time range.
- Taxes, debt payments, rental costs, insurance, HOA, and other protected items follow explicit inclusion rules.
- Results report baseline spending, adjusted spending, spending flex, and the effect on outcomes and chance of success.

## Verification
- Compare no-flex and flex scenarios across bull, flat, and drawdown sequences with essential, hybrid, and discretionary expenses.

Project: [[04 Cash Flow Goals and Debt]]
