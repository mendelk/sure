---
pm-task: true
projectId: "p_lfp_04"
parentId: null
id: "t_lfp_302"
title: "Unify projection flows with Sure goals"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["cash-flow", "goals", "integration"]
subtaskIds: []
dependencies: ["t_lfp_301"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Reuse Sure goals as factual progress inputs while allowing plan-specific future funding strategies.

## Acceptance criteria
- One-off and maintained goals can seed plan flows without sharing mutable strategy settings between plans.
- Savings flows support build-to-target, maintain-target, contribute-indefinitely, always-fund, and repurpose-excess behavior.
- Emergency funds support fixed targets and months-of-expenses targets using projected spending where appropriate.
- Simulations distinguish actual earmarked money from future contributions and avoid double-counting shared account balances.
- Reaching a target can satisfy a milestone and release lower-priority flows according to explicit settings.

## Verification
- Scenarios cover down payment, emergency reserve depletion/refill, college fund, over-earmarked accounts, and target-triggered purchase.

Project: [[04 Cash Flow Goals and Debt]]
