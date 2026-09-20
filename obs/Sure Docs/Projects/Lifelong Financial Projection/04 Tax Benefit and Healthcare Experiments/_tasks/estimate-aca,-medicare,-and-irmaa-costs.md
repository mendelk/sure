---
pm-task: true
projectId: "[[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]"
parentId:
id: "t_lfp_tax_004"
title: "Estimate ACA, Medicare, and IRMAA costs"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["healthcare", "aca", "medicare"]
subtaskIds: []
dependencies: ["[[estimate-basic-us-income-and-payroll-taxes|Estimate basic US income and payroll taxes]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:56.150Z"
timeEstimate: 10
---

Make healthcare transitions and income-sensitive costs visible in retirement projections.

## Ownership boundary
Add planning estimates for supported ages and coverage states; do not model medical underwriting or insurer-specific plans.

## Acceptance criteria
- Estimate pre-Medicare premiums and ACA subsidy effects from household income assumptions.
- Estimate Medicare premiums, IRMAA brackets, and common supplemental costs after eligibility.
- Handle household members transitioning in different years.
- Show cliffs, lookback effects, unsupported coverage, and user-overridden costs explicitly.

## Verification
- Exercise a couple crossing ACA and Medicare eligibility in different years with and without an IRMAA-triggering income event.

Project: [[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]