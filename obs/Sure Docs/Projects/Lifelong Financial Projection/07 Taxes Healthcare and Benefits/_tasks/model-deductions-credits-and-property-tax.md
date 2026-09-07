---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_603"
title: "Model deductions, credits, and property tax"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "deductions", "assets"]
subtaskIds: ["t_lfp_603_1", "t_lfp_603_2", "t_lfp_603_3"]
dependencies: ["t_lfp_602", "t_lfp_203", "t_lfp_204"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Estimate standard and itemized deductions, tax credits, rental deductions, capital-loss carryforwards, and property taxes.

## Acceptance criteria
- The engine selects standard versus itemized deductions per year and supports age-based additions, SALT limits/phaseouts, mortgage interest limits, charity, and custom deductions.
- Deductions and credits can be federal/state/local, itemized-only, owner-specific, time-bound, refundable/nonrefundable, and subject to carryforward.
- Rental property supports eligible expenses, mortgage interest, depreciation-related inputs, QBI option, and carryforward losses.
- Primary-residence gain exclusions, basis, ownership, and occupancy assumptions apply to eligible sales.
- Property tax supports assessed values, exemptions, rate changes, and California Prop 13-style rules or explicit custom equivalents.

## Verification
- Tax fixtures cover itemization crossover, SALT phaseout, rental loss, primary-home sale, charitable carryforward, and property reassessment.

Project: [[07 Taxes Healthcare and Benefits]]
