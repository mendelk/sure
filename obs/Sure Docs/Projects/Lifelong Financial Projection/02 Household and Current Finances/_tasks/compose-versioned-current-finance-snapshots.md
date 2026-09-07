---
pm-task: true
projectId: "p_lfp_02"
parentId: null
id: "t_lfp_104"
title: "Compose versioned current-finance snapshots"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["baseline", "snapshots"]
subtaskIds: []
dependencies: ["t_lfp_101", "t_lfp_103"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Produce an immutable, dated planning snapshot from household profile, accessible accounts, balances, holdings, liabilities, and planning metadata.

## Acceptance criteria
- Snapshot totals reconcile by person, ownership, account, asset class, liquidity, tax treatment, currency, and family net worth.
- Users can include or exclude accounts and decide whether shared accounts participate in their plan.
- The snapshot records source dates and warns about stale balances, prices, exchange rates, missing cost basis, and unresolved account types.
- A plan can clone the snapshot, override individual values, or remain linked to a reviewed baseline revision.
- Creating a snapshot can also create an actual-progress point without duplicating balances.

## Verification
- Reconciliation fixtures cover mixed currencies, shared accounts, provider/manual accounts, holdings, debt, and excluded records.

Project: [[02 Household and Current Finances]]
