---
pm-task: true
projectId: "[[11 International Planning|11 International Planning]]"
parentId:
id: t_lfp_1003
title: Deliver United Kingdom planning rules
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - international
  - uk
  - tax
subtaskIds:
  - "[[model-uk-accounts-and-personal-taxes|Model UK accounts and personal taxes]]"
  - "[[model-uk-pension-contributions-and-withdrawals|Model UK pension contributions and withdrawals]]"
  - "[[calculate-uk-inheritance-outcomes|Calculate UK inheritance outcomes]]"
dependencies:
  - "[[make-location-currency-and-filing-first-class|Make location, currency, and filing first-class]]"
  - "[[enforce-contribution-and-employer-match-rules|Enforce contribution and employer-match rules]]"
  - "[[implement-account-liquidity-and-drawdown-order|Implement account liquidity and drawdown order]]"
  - "[[implement-us-income-and-payroll-taxes|Implement US income and payroll taxes]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Provide a coherent UK planning preset across accounts, tax, pensions, allowances, and inheritance.

## Acceptance criteria
- Account behavior covers ISA, SIPP, workplace and defined-contribution pensions, taxable accounts, and other supported UK types.
- Income tax, National Insurance, dividend tax/allowance, capital gains, and relevant annual allowances are ruleset-versioned.
- Pension withdrawals support UFPLS and PCLS, tax-free portions, drawdown timing, and income-tax treatment.
- Contribution rules account for annual allowance, tapering where applicable, MPAA, and TAA behavior.
- Couples can model marriage allowance and separate ownership/tax calculations.
- UK inheritance tax integrates with net legacy and charitable-estate assumptions.

## Verification
- UK scenarios cover employment, SIPP contributions, PCLS/UFPLS, MPAA/TAA, marriage allowance, and inheritance tax.

Project: [[11 International Planning]]
