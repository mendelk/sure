---
pm-task: true
projectId: "[[07 Taxes Healthcare and Benefits|07 Taxes Healthcare and Benefits]]"
parentId:
id: t_lfp_602
title: Implement US income and payroll taxes
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
subtaskIds:
  - "[[calculate-us-federal-ordinary-and-payroll-taxes|Calculate US federal ordinary and payroll taxes]]"
  - "[[calculate-us-investment-amt-and-niit-taxes|Calculate US investment, AMT, and NIIT taxes]]"
  - "[[calculate-us-state-and-local-taxes|Calculate US state and local taxes]]"
dependencies:
  - "[[build-jurisdiction-aware-tax-engine|Build jurisdiction-aware tax engine]]"
  - "[[model-investment-returns-dividends-and-fees|Model investment returns, dividends, and fees]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Estimate major US taxes and taxable-income categories for every projected year.

## Acceptance criteria
- Federal ordinary income, long/short capital gains, qualified dividends, Social Security taxability, FICA/self-employment, Additional Medicare, NIIT, and AMT are supported.
- State and supported local taxes distinguish earned, retirement, pension, Social Security, dividend, and capital-gain bases and exemptions.
- Tax brackets, thresholds, exemptions, contribution limits, phaseouts, and legislation sunsets are versioned and inflation-adjusted only where law requires.
- Filing status and ownership support single, married joint, married separate, widow/survivor transitions, and applicable household differences.
- Results expose taxable income and liability by person, income type, tax type, and jurisdiction.

## Verification
- Compare representative returns across income levels, filing statuses, states/localities, retirement income, gains, and AMT/NIIT thresholds.

Project: [[07 Taxes Healthcare and Benefits]]
