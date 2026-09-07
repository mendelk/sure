---
pm-task: true
projectId: "p_lfp_07"
parentId: "t_lfp_603"
id: "t_lfp_603_2"
title: "Calculate credits and carryforwards"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "credits", "carryforwards"]
subtaskIds: []
dependencies: ["t_lfp_603_1"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Apply refundable/nonrefundable credits and preserve supported deduction, charitable, rental, and capital-loss carryforwards.

## Acceptance criteria
- Credits define eligibility, phaseout, refundability, owner, jurisdiction, and tax-year rules.
- Carryforwards retain source, amount, expiry, use order, and remaining balance.
- Current-year use never exceeds eligible income or liability constraints.

## Verification
- Exercise multi-year creation, partial use, expiry, and exhaustion of each supported carryforward.

Project: [[07 Taxes Healthcare and Benefits]]
