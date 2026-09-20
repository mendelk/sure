---
pm-task: true
projectId: "[[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]"
parentId:
id: "t_lfp_tax_002"
title: "Add investment, deduction, credit, and property tax effects"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "investments", "property"]
subtaskIds: []
dependencies: ["[[estimate-basic-us-income-and-payroll-taxes|Estimate basic US income and payroll taxes]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:53.551Z"
timeEstimate: 12
---

Expand the estimate where real plans show material differences from ordinary-income-only tax.

## Ownership boundary
Add concrete supported cases to the existing calculation; defer generic tax composition until review.

## Acceptance criteria
- Estimate long-term capital gains, qualified dividends, NIIT, and AMT where supported.
- Compare standard and itemized deductions and apply explicit supported credits and carryforwards.
- Estimate state/local, property, rental, and home-sale tax effects for selected presets.
- Reconcile withholding, estimated payments, refunds, and balances without hiding negative cash effects.

## Verification
- Exercise investment-sale, itemized-deduction, rental, home-sale, and credit-carryforward reference households.

Project: [[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]