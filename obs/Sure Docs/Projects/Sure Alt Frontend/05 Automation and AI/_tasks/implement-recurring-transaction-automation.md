---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_001"
title: "Implement recurring transaction automation"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["recurring", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
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
