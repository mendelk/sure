---
pm-task: true
projectId: "[[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]"
parentId:
id: "t_lfp_flows_005"
title: "Handle inflation, currency, and partial years"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["inflation", "currency", "timing"]
subtaskIds: []
dependencies: ["[[project-account-balances,-contributions,-and-returns|Project account balances, contributions, and returns]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:51.105Z"
timeEstimate: 8
---

Improve timing and value interpretation where the working ledger demonstrates material errors.

## Ownership boundary
Add only calendar, inflation, currency-conversion, and partial-year behavior required by accepted scenarios.

## Acceptance criteria
- Show nominal and real values without mixing their bases.
- Use historical or explicit projection exchange rates for supported multi-currency starting balances.
- Prorate dated events, contributions, returns, and withdrawals for partial first and final years.
- Expose the valuation date, currency basis, and rounding used by each result.

## Verification
- Compare full-year and partial-year plans plus a two-currency household and reconcile displayed real and nominal totals.

Project: [[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]