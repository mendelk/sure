---
pm-task: true
projectId: "[[11 International Planning|11 International Planning]]"
parentId:
id: t_lfp_1004
title: Deliver Australia planning rules
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - international
  - australia
  - tax
subtaskIds:
  - "[[model-australian-accounts-and-personal-taxes|Model Australian accounts and personal taxes]]"
  - "[[model-australian-superannuation|Model Australian superannuation]]"
  - "[[calculate-australian-franking-credits|Calculate Australian franking credits]]"
dependencies:
  - "[[make-location-currency-and-filing-first-class|Make location, currency, and filing first-class]]"
  - "[[model-investment-returns-dividends-and-fees|Model investment returns, dividends, and fees]]"
  - "[[enforce-contribution-and-employer-match-rules|Enforce contribution and employer-match rules]]"
  - "[[implement-us-income-and-payroll-taxes|Implement US income and payroll taxes]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Provide a coherent Australian planning preset across superannuation, personal tax, contributions, withdrawals, and dividends.

## Acceptance criteria
- Account behavior covers superannuation, taxable investments, cash, property, and other supported Australian types.
- Personal income tax, Medicare-related levies where supported, capital gains treatment, and thresholds are tax-year-versioned.
- Employer and personal super contributions respect concessional/non-concessional limits, age, and contribution tax assumptions.
- Retirement-phase access and withdrawals follow configured eligibility and tax treatment.
- Dividends distinguish franked and unfranked amounts and estimate franking credits.

## Verification
- Australian scenarios cover accumulation, employer contributions, limit handling, retirement withdrawals, gains, and franked dividends.

Project: [[11 International Planning]]
