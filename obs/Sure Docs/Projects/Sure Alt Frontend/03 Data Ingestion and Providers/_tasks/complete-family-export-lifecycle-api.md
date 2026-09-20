---
pm-task: true
projectId: "[[03 Data Ingestion and Providers|03 Data Ingestion and Providers]]"
parentId:
id: t_alt_ing_016
title: Complete family export lifecycle API
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - exports
  - api
  - backend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
timeEstimate: 24
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Complete family export create/list/status/download/cancel/delete semantics for the alternate frontend.

## Acceptance criteria
- Reconcile existing API operations with Rails cancel/destroy/archive behavior and add required role-scoped endpoints.
- Use expiring authorized downloads or streamed BFF responses with safe filenames/content headers.
- Distinguish queued, processing, completed, failed, cancelled, expired, missing-file, and unavailable states.
- Make create/cancel/delete idempotency and retention behavior explicit.
- Never expose storage paths or tokens in logs, referers, or long-lived browser state.

## Verification
- Minitest, docs-only rswag/OpenAPI, and download authorization/content tests pass.

Project: [[03 Data Ingestion and Providers]]
