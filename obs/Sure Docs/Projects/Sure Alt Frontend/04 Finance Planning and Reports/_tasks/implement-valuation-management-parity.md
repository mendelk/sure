---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_007
title: Implement valuation management parity
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - accounts
  - valuations
  - api
subtaskIds: []
dependencies:
  - "[[complete-account-management-api|Complete account management API]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
timeEstimate: 32
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
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
