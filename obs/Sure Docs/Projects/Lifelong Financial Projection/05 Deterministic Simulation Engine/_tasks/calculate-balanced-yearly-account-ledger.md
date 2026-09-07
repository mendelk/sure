---
pm-task: true
projectId: "p_lfp_05"
parentId: "t_lfp_401"
id: "t_lfp_401_2"
title: "Calculate balanced yearly account ledger"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "ledger"]
subtaskIds: []
dependencies: ["t_lfp_401_1"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Calculate typed yearly ledger entries and closing balances for each account, person, and household.

## Acceptance criteria
- Every balance change is represented by exactly one typed ledger entry and rolls up to household totals.
- Transfers, gains, contributions, withdrawals, debt principal, tax, and spending remain distinct.
- Account and household equations balance to the configured monetary precision.

## Verification
- Reconcile mixed-account accumulation and retirement years to the cent.

Project: [[05 Deterministic Simulation Engine]]
