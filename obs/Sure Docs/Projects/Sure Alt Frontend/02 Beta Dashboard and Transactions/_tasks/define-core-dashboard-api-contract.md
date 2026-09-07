---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_001"
title: "Define core dashboard API contract"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["api", "dashboard", "backend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004", "t_alt_fnd_018"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Provide the API data needed for the core dashboard without reproducing Rails view-model logic in the browser.

## Acceptance criteria
- Specify net worth/balance-sheet totals and trends, grouped account summaries, recent transactions, and current sync state.
- Reuse existing `/api/v1/balance_sheet`, accounts, balances, transactions, and sync endpoints where their contracts are sufficient.
- Add only missing fields/operations, with consistent currency/date semantics, bounded ranges, authorization, and empty states.
- Prevent N+1 queries and document expected request count and representative response size.

## Verification
- Minitest covers behavior and authorization; rswag remains documentation-only; `docs/api/openapi.yaml` is regenerated.
- Contract fixtures cover empty, single-currency, multi-currency, stale, and syncing families.

Project: [[02 Beta Dashboard and Transactions]]
