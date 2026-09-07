---
pm-task: true
projectId: "p_lfp_09"
parentId: null
id: "t_lfp_803"
title: "Deliver tax analytics and effective brackets"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "tax"]
subtaskIds: ["t_lfp_803_1", "t_lfp_803_2", "t_lfp_803_3"]
dependencies: ["t_lfp_602", "t_lfp_603", "t_lfp_604", "t_lfp_801"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Explain future income, tax liability, marginal rates, and effective brackets for each simulated year.

## Acceptance criteria
- Analytics break down income, taxable income, deductions, credits, taxes, and rates by jurisdiction, tax type, person, and source.
- Effective-bracket analysis combines applicable interacting taxes to show how an additional dollar of each income type would be taxed.
- Users can aggregate sources or inspect individual line items and see custom tax modifiers.
- Income-by-tax-rate analysis reveals how much income falls in each effective band over time.
- Metrics include lifetime tax, IRMAA/ACA effects, giving, legacy, net legacy, estate drag, and supported estate taxes.

## Verification
- Effective bracket boundaries and additional-dollar rates match the underlying tax engine around deductions, phaseouts, and cliffs.

Project: [[09 Analytics Reports and Progress]]
