---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_004"
title: "Implement account statement workflows"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "uploads", "api"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fin_001", "t_alt_fnd_005", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

API-enable and implement account statement list/upload/detail/edit/link/unlink/reject/delete workflows.

## Acceptance criteria
- Define bounded file types/sizes, ownership, processing/status, extracted metadata, and allowed actions in OpenAPI.
- Stream uploads through the BFF, validate content server-side, and never expose storage paths.
- Build accessible upload/progress, review, account-linking, rejection, and deletion UI.
- Handle duplicates, parse failures, unsupported files, interrupted uploads, and stale account links.
- Preserve privacy in previews, logs, and test artifacts.

## Verification
- Rails behavior/docs tests and browser scenarios cover the complete statement lifecycle and authorization failures.

Project: [[04 Finance Planning and Reports]]
