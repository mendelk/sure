---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_003
title: Build account detail activity and balance history
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - accounts
  - frontend
  - charts
subtaskIds: []
dependencies:
  - "[[complete-account-management-api|Complete account management API]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[evaluate-tanstack-charts-for-sure-visualizations|Evaluate TanStack Charts for Sure visualizations]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:28.921Z
timeEstimate: 40
---

Turn the beta account placeholder into complete account overview, balance history, and activity routes.

## Acceptance criteria
- Show subtype-aware metadata, current balance, historical trend, provider/manual status, sync state, and allowed management actions.
- Integrate filtered transaction/trade/valuation/holding activity without duplicating list implementations.
- Add or extend bounded sparkline/history contracts only where current balance endpoints are insufficient.
- Support URL-driven ranges/tabs, privacy mode, themes, localization, keyboard chart access, and responsive layouts.
- Handle disabled, shared, disconnected, stale, empty, and deleted accounts.

## Verification
- Real-API Playwright covers representative asset/liability/manual/provider accounts and deep-linked activity state.

Project: [[04 Finance Planning and Reports]]
