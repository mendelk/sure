---
pm-task: true
projectId: "[[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]"
parentId:
id: t_lfp_flows_006
title: Expose and review the balanced yearly ledger
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - ledger
  - explainability
  - checkpoint
subtaskIds: []
dependencies:
  - "[[model-retirement-distributions-and-income-products|Model retirement distributions and income products]]"
  - "[[handle-inflation,-currency,-and-partial-years|Handle inflation, currency, and partial years]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:52.709Z
timeEstimate: 10
---

Use the working accumulation and drawdown scenarios to settle the calculation order and explanation needed for trustworthy results.

## Ownership boundary
Own a visible ledger and review checkpoint. Do not extract a standalone simulation platform before the selected behavior is integrated.

## Acceptance criteria
- Reconcile each year from starting balances through flows, growth, taxes placeholders, and ending balances.
- Keep income, spending, transfers, contributions, withdrawals, debt, growth, and unresolved shortfalls distinct.
- Review accumulation, transition, retirement, and insolvency scenarios in the browser.
- Record the accepted processing order, keep/change/delete decisions, and only the invariants proven by these scenarios.

## Verification
- Manually reconcile reference years to the cent and demonstrate why the selected processing order changes at least one edge case.

Project: [[03 Cash Flow and Retirement Experiments]]
