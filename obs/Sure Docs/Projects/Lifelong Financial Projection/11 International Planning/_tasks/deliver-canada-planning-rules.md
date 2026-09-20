---
pm-task: true
projectId: "[[11 International Planning|11 International Planning]]"
parentId:
id: t_lfp_1002
title: Deliver Canada planning rules
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - international
  - canada
  - tax
subtaskIds:
  - "[[model-canadian-accounts-and-contributions|Model Canadian accounts and contributions]]"
  - "[[calculate-canadian-income-and-dividend-taxes|Calculate Canadian income and dividend taxes]]"
  - "[[calculate-canadian-benefits-and-couple-strategies|Calculate Canadian benefits and couple strategies]]"
dependencies:
  - "[[make-location-currency-and-filing-first-class|Make location, currency, and filing first-class]]"
  - "[[enforce-contribution-and-employer-match-rules|Enforce contribution and employer-match rules]]"
  - "[[implement-us-income-and-payroll-taxes|Implement US income and payroll taxes]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
  - "[[estimate-social-security-pensions-and-medicare|Estimate Social Security, pensions, and Medicare]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Provide a coherent Canadian planning preset across accounts, federal/provincial taxes, contributions, withdrawals, dividends, and benefits.

## Acceptance criteria
- Account behavior covers RRSP, RRIF with configurable conversion age, TFSA, taxable accounts, employer pensions, and other supported Canadian types.
- Federal and maintained provincial tax rules include contribution deductions, withdrawals, credits, and annual thresholds.
- Employment Insurance and CPP contributions are estimated from eligible earnings.
- CPP, survivor benefits, OAS, and GIS income are estimated with claiming and eligibility assumptions.
- Couples support pension-income splitting, CPP pension sharing, and separate owner calculations.
- Eligible, non-eligible, and foreign dividends receive correct gross-up and dividend-credit treatment.

## Verification
- Canadian reference households cover working years, retirement, RRSP meltdown, pension splitting, CPP sharing, OAS/GIS, and survivor benefits.

Project: [[11 International Planning]]
