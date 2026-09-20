---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_014
title: Add goals and pledges API
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - goals
  - api
  - backend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:46.452Z
timeEstimate: 40
---

Create a complete JSON API for goals, funding accounts, projections, consumption, lifecycle transitions, and pledges.

## Acceptance criteria
- Cover list/show/create/update/delete, pause/resume/complete/archive/unarchive/reopen, consume preview/record, and pledge create/delete/renew.
- Return goal status, target/current values, dates, funding breakdown, projection series/assumptions, capabilities, and validation.
- Use decimal-safe server calculations and idempotent lifecycle/consumption actions.
- Enforce family/account access and explicit conflicts for invalid transitions or unavailable funds.
- Bound projection data and avoid exposing unrelated account details.

## Verification
- Minitest exercises lifecycle/state calculations and roles; docs-only rswag and regenerated OpenAPI cover all operations.

Project: [[04 Finance Planning and Reports]]
