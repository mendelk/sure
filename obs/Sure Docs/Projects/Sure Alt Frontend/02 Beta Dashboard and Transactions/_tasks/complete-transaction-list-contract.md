---
pm-task: true
projectId: "[[02 Beta Dashboard and Transactions|02 Beta Dashboard and Transactions]]"
parentId:
id: t_alt_beta_004
title: Complete transaction list contract
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - api
  - transactions
  - backend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:30.231Z
timeEstimate: 28
---

Make the transactions API sufficient for a URL-driven, paginated browsing and editing experience.

## Acceptance criteria
- Audit existing filters/sorts and add missing documented parameters needed for dates, accounts, amount/type, category, merchant, tags, status, and free-text search.
- Return stable pagination metadata and fields needed for pending, transfer, split, recurring, duplicate, and locked states.
- Define unambiguous amount/currency/date/time semantics and validation errors.
- Keep queries bounded, indexed, family-scoped, and compatible with API-key and OAuth authorization rules.

## Verification
- Minitest covers each filter/sort combination and authorization edge; rswag documents without behavioral assertions; OpenAPI is regenerated.

Project: [[02 Beta Dashboard and Transactions]]
