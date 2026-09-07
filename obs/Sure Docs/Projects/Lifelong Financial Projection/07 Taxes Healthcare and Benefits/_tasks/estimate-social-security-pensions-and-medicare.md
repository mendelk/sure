---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_605"
title: "Estimate Social Security, pensions, and Medicare"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["benefits", "retirement", "healthcare"]
subtaskIds: ["t_lfp_605_1", "t_lfp_605_2", "t_lfp_605_3"]
dependencies: ["t_lfp_202", "t_lfp_601", "t_lfp_101"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Estimate retirement benefits and healthcare costs from user-provided statements and plan timing.

## Acceptance criteria
- Social Security accepts SSA statement inputs and models claiming age, benefit COLA, spousal/survivor interactions, and taxable portion.
- Defined-benefit pensions support commencement, COLA, survivor percentage, ownership, and tax character without double-counting income events.
- Medicare is a formal expense with Part B, Part D, supplemental coverage, enrollment age, and owner-specific timing.
- IRMAA uses applicable lookback income, filing status, thresholds, and cost components.
- Benefits and healthcare remain separately visible in income, expenses, taxes, cash flow, and optimization targets.

## Verification
- Cover early/full/delayed claiming, couple survivor transition, pension survivor benefits, Medicare enrollment, and IRMAA cliffs.

Project: [[07 Taxes Healthcare and Benefits]]
