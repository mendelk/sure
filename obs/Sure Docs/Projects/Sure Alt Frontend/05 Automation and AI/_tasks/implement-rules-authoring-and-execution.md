---
pm-task: true
projectId: "[[05 Automation and AI|05 Automation and AI]]"
parentId:
id: t_alt_auto_002
title: Implement rules authoring and execution
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - rules
  - api
  - frontend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:34.721Z
timeEstimate: 40
---

Extend read-only rules APIs and implement rule CRUD, nested conditions/actions, preview/confirm/apply, bulk actions, run history, and AI-cache clearing.

## Acceptance criteria
- Define typed discriminated schemas for every supported condition/action rather than accepting arbitrary JSON.
- Add create/update/delete/confirm/apply/apply-all/destroy-all/clear-cache operations with scopes, idempotency, and previews.
- Build accessible nested TanStack Form editing with add/remove/reorder, validation, and plain-language summaries.
- Show rule-run results and partial failures without exposing raw AI/provider data.
- Require confirmation before applying rules to historical transactions and refresh affected queries.

## Verification
- Rails behavior/docs and browser tests cover each condition/action family, preview, apply, bulk operations, validation, and history.

Project: [[05 Automation and AI]]
