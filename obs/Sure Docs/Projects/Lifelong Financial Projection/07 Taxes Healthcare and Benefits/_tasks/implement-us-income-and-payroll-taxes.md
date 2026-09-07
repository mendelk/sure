---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_602"
title: "Implement US income and payroll taxes"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "us"]
subtaskIds: ["t_lfp_602_1", "t_lfp_602_2", "t_lfp_602_3"]
dependencies: ["t_lfp_601", "t_lfp_501"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
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
