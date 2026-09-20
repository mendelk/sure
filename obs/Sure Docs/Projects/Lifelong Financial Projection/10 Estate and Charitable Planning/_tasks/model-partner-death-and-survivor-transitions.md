---
pm-task: true
projectId: "[[10 Estate and Charitable Planning|10 Estate and Charitable Planning]]"
parentId:
id: t_lfp_901
title: Model partner death and survivor transitions
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - estate
  - household
subtaskIds:
  - "[[end-person-specific-events-at-death|End person-specific events at death]]"
  - "[[transfer-ownership-and-account-benefits-at-death|Transfer ownership and account benefits at death]]"
  - "[[apply-survivor-tax-benefit-and-healthcare-rules|Apply survivor tax, benefit, and healthcare rules]]"
dependencies:
  - "[[model-household-members-and-life-expectancy|Model household members and life expectancy]]"
  - "[[build-conditional-milestone-system|Build conditional milestone system]]"
  - "[[estimate-social-security-pensions-and-medicare|Estimate Social Security, pensions, and Medicare]]"
  - "[[implement-the-annual-simulation-ledger|Implement the annual simulation ledger]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Model either partner outliving the other and the household transition at each life-expectancy milestone.

## Acceptance criteria
- Death ends person-specific income/expenses as configured and activates survivor income, expenses, and benefits.
- Individual and joint assets transfer under explicit beneficiary assumptions without creating or losing value.
- Filing status, tax brackets, contribution eligibility, RMDs, Social Security/pension survivor benefits, and healthcare change at the correct time.
- Basis step-up applies only to eligible ownership shares, account types, and jurisdictions.
- Both death orders can be evaluated without requiring separate unrelated household records.

## Verification
- Cover primary-first, partner-first, joint/separate property, survivor benefits, step-up, and long age-gap cases.

Project: [[10 Estate and Charitable Planning]]
