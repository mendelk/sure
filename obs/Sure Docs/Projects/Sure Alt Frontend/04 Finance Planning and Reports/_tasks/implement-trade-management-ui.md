---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_006
title: Implement trade management UI
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - investments
  - trades
  - frontend
subtaskIds: []
dependencies:
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:33.382Z
timeEstimate: 36
---

Build trade detail/create/edit/delete and unlock workflows from the existing trades API, extending only missing parity behavior.

## Acceptance criteria
- Support account/security, buy/sell type, quantity, price, fees, currency, date, and contract-documented fields with decimal-safe validation.
- Add unlock and transaction-to-trade conversion contracts when required by the parity matrix.
- Show calculated totals and validation without substituting browser arithmetic for backend authority.
- Handle provider-locked trades, missing prices/securities, deletion, stale edits, and offline/duplicate submissions.
- Refresh holdings, account activity, transactions, and dashboard data narrowly.

## Verification
- Component and Rails-backed tests cover buy/sell, fees, unlock, conversion, edit, delete, and validation edge cases.

Project: [[04 Finance Planning and Reports]]
