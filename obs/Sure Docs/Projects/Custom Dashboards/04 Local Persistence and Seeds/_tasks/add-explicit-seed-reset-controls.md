---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_004
title: Add explicit seed reset controls
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - seeds
  - recovery
subtaskIds: []
dependencies:
  - "[[add-versioned-non-destructive-seeds|Add versioned non-destructive seeds]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Turn the prototype reset into deliberate current-seed and full-feature reset behavior.

## Ownership boundary
Own reset operations plus their narrow confirmation UI. Do not run resets during startup, validation failure, or seed reconciliation.

## Acceptance criteria
- Allow resetting one shipped dashboard to the latest catalog and separately clearing all custom-dashboard feature data.
- Show exactly which dashboards and report cards will be replaced or removed before confirmation.
- Apply each reset atomically and choose a valid active dashboard afterward without a full page reload.
- A current-seed reset leaves unrelated user-created dashboards unchanged; a full reset installs the latest starter catalog.

## Verification
- Customize and add data, cancel and confirm both reset scopes, refresh, and verify the documented records survive or reset.

Project: [[04 Local Persistence and Seeds]]
