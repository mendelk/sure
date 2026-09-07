---
pm-task: true
projectId: "p_lfp_05"
parentId: null
id: "t_lfp_401"
title: "Implement the annual simulation ledger"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "ledger"]
subtaskIds: ["t_lfp_401_1", "t_lfp_401_2", "t_lfp_401_3"]
dependencies: ["t_lfp_206", "t_lfp_301", "t_lfp_303", "t_lfp_304"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
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
