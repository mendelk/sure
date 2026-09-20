---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_004
title: Implement account statement workflows
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - accounts
  - uploads
  - api
subtaskIds: []
dependencies:
  - "[[complete-account-management-api|Complete account management API]]"
  - "[[implement-hardened-sure-api-bff-transport|Implement hardened Sure API BFF transport]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:30.252Z
timeEstimate: 40
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
