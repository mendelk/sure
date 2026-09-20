---
pm-task: true
projectId: "[[07 Taxes Healthcare and Benefits|07 Taxes Healthcare and Benefits]]"
parentId:
id: t_lfp_605
title: Estimate Social Security, pensions, and Medicare
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - benefits
  - retirement
  - healthcare
subtaskIds:
  - "[[calculate-social-security-benefits|Calculate Social Security benefits]]"
  - "[[calculate-defined-benefit-pensions|Calculate defined-benefit pensions]]"
  - "[[calculate-medicare-and-irmaa-costs|Calculate Medicare and IRMAA costs]]"
dependencies:
  - "[[model-income-and-benefit-events|Model income and benefit events]]"
  - "[[build-jurisdiction-aware-tax-engine|Build jurisdiction-aware tax engine]]"
  - "[[model-household-members-and-life-expectancy|Model household members and life expectancy]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
