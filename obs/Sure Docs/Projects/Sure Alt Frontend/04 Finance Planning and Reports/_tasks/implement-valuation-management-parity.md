---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_007"
title: "Implement valuation management parity"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "valuations", "api"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Complete valuation show/create/update/delete and confirmation behavior for manually valued accounts.

## Acceptance criteria
- Add missing delete and explicit preview/confirmation contract behavior where current endpoints cannot support parity safely.
- Build decimal-safe forms with date, amount, currency, notes, and account capability validation.
- Explain downstream balance/history impact before confirmation and require explicit destructive confirmation for deletion.
- Handle same-date conflicts, locked/provider accounts, stale edits, and server validation without losing input.
- Refresh account balances/history and dashboard totals after success.

## Verification
- Minitest/docs/OpenAPI and Rails-backed Playwright cover create/update/delete, confirmation, conflict, and authorization states.

Project: [[04 Finance Planning and Reports]]
