---
pm-task: true
projectId: "[[05 Automation and AI|05 Automation and AI]]"
parentId:
id: t_alt_auto_001
title: Implement recurring transaction automation
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - recurring
  - api
  - frontend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:33.165Z
timeEstimate: 40
---

Complete recurring transaction list/detail/create/update/delete, identification, cleanup, settings, status toggle, and mark-from-transaction workflows.

## Acceptance criteria
- Extend current recurring APIs for identify/cleanup/settings/toggle and transaction/transfer marking required by the parity matrix.
- Model cadence, expected amount/date, source, status, linked transactions, confidence, and allowed actions explicitly.
- Build responsive browsing/forms and guarded bulk identify/cleanup actions with progress and summaries.
- Preserve server authority for recurrence detection and calculations; handle stale patterns and concurrent edits.
- Refresh transaction, transfer, dashboard, and planning queries narrowly.

## Verification
- Minitest/docs/OpenAPI and Rails-backed Playwright cover lifecycle, detection, cleanup, settings, toggle, and mark actions.

Project: [[05 Automation and AI]]
