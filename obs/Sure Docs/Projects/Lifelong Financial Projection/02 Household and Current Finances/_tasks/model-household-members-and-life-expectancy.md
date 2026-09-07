---
pm-task: true
projectId: "p_lfp_02"
parentId: null
id: "t_lfp_101"
title: "Model household members and life expectancy"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["household", "baseline"]
subtaskIds: []
dependencies: ["t_lfp_003"]
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Extend household planning facts beyond login users so a plan can represent the primary person, spouse or partner, dependents, and other supported beneficiaries.

## Acceptance criteria
- Each planned person can have birth month/year, retirement timing, life expectancy, tax role, display identity, and relationship to the household.
- Couples can be married now, marry during a plan, file jointly or separately, retire at different times, and have different life expectancies.
- Dependents support current age, education timing, support periods, and education-account use.
- Ownership can be individual, partner, or joint for accounts, income, expenses, assets, and liabilities.
- A partner's death or departure can change ownership, filing status, benefits, and event applicability without deleting historical facts.

## Verification
- Scenarios cover single, married, unmarried partner, widowed, age-gap couple, and household with dependents.

Project: [[02 Household and Current Finances]]
