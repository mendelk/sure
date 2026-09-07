---
pm-task: true
projectId: "p_lfp_06"
parentId: null
id: "t_lfp_505"
title: "Model required and inherited-account distributions"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "rmd", "inheritance"]
subtaskIds: []
dependencies: ["t_lfp_504", "t_lfp_101"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Model mandatory retirement-account distributions for owners, spouses, and inherited accounts.

## Acceptance criteria
- RMD eligibility, life-expectancy factors, spouse age exceptions, account aggregation, and designated Roth exemptions are ruleset-versioned.
- Traditional and Roth inherited accounts support 10-year divestment, stretch treatment, and custom distribution schedules.
- Beneficiary age gaps and original-owner facts select the correct inherited-account treatment.
- Taxable expenses/transfers already distributed from an account reduce remaining RMD requirements for that year.
- Users can record distributions already taken before the plan start to avoid first-year duplication.

## Verification
- Cover owner RMD, younger spouse, inherited traditional/Roth, 10-year deadline, stretch, and partial first-year scenarios.

Project: [[06 Investments Contributions and Drawdown]]
