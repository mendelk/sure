---
pm-task: true
projectId: "[[04 Tax Benefit and Healthcare Experiments|04 Tax Benefit and Healthcare Experiments]]"
parentId:
id: t_lfp_tax_001
title: Estimate basic US income and payroll taxes
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - tax
  - us
  - experiment
subtaskIds: []
dependencies:
  - "[[expose-and-review-the-balanced-yearly-ledger|Expose and review the balanced yearly ledger]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:52.139Z
timeEstimate: 12
---

Put a transparent federal ordinary-income and payroll-tax estimate into the working yearly ledger.

## Ownership boundary
Implement a narrow US estimate for exercised income types and filing statuses. Do not build a jurisdiction engine first.

## Acceptance criteria
- Estimate ordinary federal income tax, Social Security payroll tax, and Medicare payroll tax from visible inputs.
- Support single and married filing assumptions with annual brackets and standard deduction.
- Show taxable income, marginal bracket, effective rate, withholding, and settlement separately.
- Version the local rule constants and label unsupported income or filing situations.

## Verification
- Compare hand-calculable working and retired households against published-year examples and inspect every ledger line.

Project: [[04 Tax Benefit and Healthcare Experiments]]
