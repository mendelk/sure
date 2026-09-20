---
pm-task: true
projectId: "[[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]"
parentId:
id: t_lfp_flows_004
title: Model retirement distributions and income products
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - retirement
  - rmd
  - annuities
subtaskIds: []
dependencies:
  - "[[cover-shortfalls-with-explicit-withdrawals|Cover shortfalls with explicit withdrawals]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:49.436Z
timeEstimate: 10
---

Add the retirement behaviors that materially change accepted drawdown scenarios.

## Ownership boundary
Extend only supported local account calculations; detailed jurisdiction tax treatment remains in the next phase.

## Acceptance criteria
- Model required minimum distributions and inherited-account distribution schedules.
- Support configurable pension or annuity income and common fixed or percentage withdrawal strategies.
- Show limits, early-withdrawal penalties, and strategy failures in the yearly explanation.
- Keep each distribution attributable to its account, owner, and triggering rule.

## Verification
- Exercise pre-retirement access, RMD years, inherited distributions, pension income, and a failed withdrawal strategy.

Project: [[03 Cash Flow and Retirement Experiments]]
