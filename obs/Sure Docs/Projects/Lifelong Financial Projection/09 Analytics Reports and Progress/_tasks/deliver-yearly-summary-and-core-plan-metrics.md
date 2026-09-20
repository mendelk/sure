---
pm-task: true
projectId: "[[09 Analytics Reports and Progress|09 Analytics Reports and Progress]]"
parentId:
id: t_lfp_801
title: Deliver yearly summary and core plan metrics
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - analytics
  - metrics
subtaskIds:
  - "[[define-core-planning-metric-registry|Define core planning metric registry]]"
  - "[[generate-explainable-yearly-summaries|Generate explainable yearly summaries]]"
  - "[[configure-plan-metric-selections|Configure plan metric selections]]"
dependencies:
  - "[[make-simulation-results-auditable-and-repeatable|Make simulation results auditable and repeatable]]"
  - "[[implement-account-liquidity-and-drawdown-order|Implement account liquidity and drawdown order]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Expose a complete annual explanation and standard metric library for deterministic and stochastic results.

## Acceptance criteria
- Core metrics include net worth, liquid net worth, assets, liabilities, cash, income, passive income, spending, expenses, savings rate, taxes, contributions, withdrawals, debt payments, allocation, withdrawal rate, and change in net worth.
- Metrics retain person, account, category, tax, and event line-item breakdowns where applicable.
- Users can select, order, hide, auto-filter, and define calculation options for configurable metrics such as spending, effective tax rate, and liquidity.
- A selected year reports full-period values, starting/ending balances, notable events, milestone state, and warnings.
- Metric definitions are consistent across plan, compare, chance-of-success, tax, estate, and exported reports.

## Verification
- Each headline metric reconciles to yearly ledger components and remains stable across chart/table/export representations.

Project: [[09 Analytics Reports and Progress]]
