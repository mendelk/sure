---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_002"
title: "Implement rules authoring and execution"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["rules", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
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
