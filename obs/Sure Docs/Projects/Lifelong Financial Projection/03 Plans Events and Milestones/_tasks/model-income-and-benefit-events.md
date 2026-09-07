---
pm-task: true
projectId: "p_lfp_03"
parentId: null
id: "t_lfp_202"
title: "Model income and benefit events"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["events", "income"]
subtaskIds: []
dependencies: ["t_lfp_201", "t_lfp_101"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Model all expected inflows across a lifetime with ownership, timing, growth, tax, withholding, and routing behavior.

## Acceptance criteria
- Presets cover salary, hourly wage, side hustle/self-employment, rental income, pension, Social Security/government benefits, annuity, RSU grants, inheritance, and custom income.
- Events support one-time, daily, weekly, bi-weekly, monthly, quarterly, once-yearly, annual, and custom recurrence frequencies.
- Each source has start/end month, milestone bindings, owner, passive-income status, tax character, withholding mode, and real/nominal amount semantics.
- Proceeds can enter general cash flow, route to one or several accounts, modify investments, or pay a linked loan.
- Defined-benefit pensions support final-pay, career-average, fixed-benefit, COLA, survivor, and commencement assumptions.

## Verification
- Annual totals and tax classifications reconcile for partial years, multiple owners, direct routing, and overlapping income phases.

Project: [[03 Plans Events and Milestones]]
