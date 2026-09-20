---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_012
title: Complete budget write API
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - budgets
  - api
  - backend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:43.209Z
timeEstimate: 32
---

Extend read-only budget APIs for allocation editing, category movement, copy-previous, and family budget-sharing preferences.

## Acceptance criteria
- Define month identifiers, owner/share scope, income/allocation/actual/available totals, category groups, and edit capabilities.
- Add decimal-safe idempotent operations for allocations, moving categories, copying prior month, and budget sharing.
- Return conflict/validation details for oversubscription, stale totals, inaccessible owners, and invalid categories.
- Keep calculations authoritative on Rails and responses sufficient for targeted query updates.
- Preserve family role and account-sharing rules.

## Verification
- Minitest covers calculations/concurrency/roles; docs-only rswag and regenerated OpenAPI cover all operations.

Project: [[04 Finance Planning and Reports]]
