---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_011"
title: "Complete category tag and merchant management"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["classification", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Complete standalone category, tag, and family-merchant CRUD, merge, bootstrap/import/enhance, and deletion reassignment workflows.

## Acceptance criteria
- Extend existing APIs for missing update/delete/merge/bulk/bootstrap/enhance operations with previews for destructive reclassification.
- Build searchable responsive management routes with accessible color/icon controls and usage counts.
- Require destination/reassignment choices where deleting used records and make transaction/budget/rule impact explicit.
- Handle duplicate names, provider merchants, stale merges, bulk delete, and rollback/error states.
- Refresh all classification consumers narrowly after success.

## Verification
- Rails behavior/docs/OpenAPI and Playwright cover CRUD, merge, reassignment, bulk actions, bootstrap/import/enhance, and authorization.

Project: [[04 Finance Planning and Reports]]
