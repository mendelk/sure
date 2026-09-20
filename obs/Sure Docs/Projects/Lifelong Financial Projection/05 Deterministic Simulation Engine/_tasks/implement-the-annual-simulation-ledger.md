---
pm-task: true
projectId: "[[05 Deterministic Simulation Engine|05 Deterministic Simulation Engine]]"
parentId:
id: t_lfp_401
title: Implement the annual simulation ledger
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - simulation
  - ledger
subtaskIds:
  - "[[specify-simulation-processing-order|Specify simulation processing order]]"
  - "[[calculate-balanced-yearly-account-ledger|Calculate balanced yearly account ledger]]"
  - "[[resolve-shortfall-liquidity-and-insolvency|Resolve shortfall, liquidity, and insolvency]]"
dependencies:
  - "[[support-recurring-and-variable-events|Support recurring and variable events]]"
  - "[[implement-ordered-cash-flow-allocation|Implement ordered cash-flow allocation]]"
  - "[[support-transfers-routing-and-multi-account-funding|Support transfers, routing, and multi-account funding]]"
  - "[[model-debt-repayment-and-forgiveness|Model debt repayment and forgiveness]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Calculate each simulated year as a balanced ledger of starting balances, inflows, withholding, expenses, contributions, transfers, debt, taxes, growth, withdrawals, and ending balances.

## Acceptance criteria
- Processing order is explicitly specified and stable for every supported event and account operation.
- Surplus and shortfall are derived from events and flows rather than entered as an independent savings amount.
- Internal transfers, market growth, contributions, withdrawals, spending, tax liability, and tax remittance remain separate classifications.
- Account, person, jurisdiction, event, and flow line items roll up exactly to household totals.
- Insolvency, unfunded obligations, illiquid wealth, negative balances, and terminal-plan behavior are explicit outcomes.

## Verification
- Double-entry-style invariants reconcile every yearly result to the cent across representative accumulation and drawdown plans.

Project: [[05 Deterministic Simulation Engine]]
