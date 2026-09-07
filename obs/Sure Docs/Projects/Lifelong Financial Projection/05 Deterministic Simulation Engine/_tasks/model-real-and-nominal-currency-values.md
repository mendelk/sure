---
pm-task: true
projectId: "p_lfp_05"
parentId: null
id: "t_lfp_403"
title: "Model real and nominal currency values"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "inflation", "currency"]
subtaskIds: []
dependencies: ["t_lfp_401", "t_lfp_402"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Model all monetary inputs and results in nominal values while allowing users to enter and view amounts in today's purchasing power.

## Acceptance criteria
- Every amount records currency, reference year, and whether its schedule is nominal, real, inflation-linked, benefit-COLA-linked, or custom.
- Today's currency always references the actual current year, including fixed-date plans.
- Results can switch between nominal and real presentation without changing the underlying simulation or chance-of-success result.
- Inflation supports fixed rates, custom sequences, historical series, shocks, and category-specific spreads such as healthcare inflation plus 2%.
- Multi-currency plans use dated exchange-rate assumptions without summing unlike currencies.

## Verification
- Round-trip and reference-year fixtures prove equivalent real/nominal plans produce equivalent economic outcomes.

Project: [[05 Deterministic Simulation Engine]]
