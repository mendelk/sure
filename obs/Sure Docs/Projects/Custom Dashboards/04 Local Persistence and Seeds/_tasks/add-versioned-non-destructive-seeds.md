---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_003
title: Add versioned non-destructive seeds
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - seeds
  - local-storage
subtaskIds: []
dependencies:
  - "[[capture-the-proven-local-dashboard-shape|Capture the proven local dashboard shape]]"
timeEstimate: 10
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Evolve the proven starter dashboard without overwriting user changes.

## Ownership boundary
Own source-controlled seed versions and reconciliation in persistence files. Do not render reset or upgrade UI.

## Acceptance criteria
- Give shipped dashboard/report/card records stable seed IDs and track which catalog versions have been applied.
- Add newly introduced seed records on upgrade only when absent; never replace user-edited names, SureQL, presentation choices, or layouts.
- Remember intentional deletion so startup does not resurrect removed seeded cards or dashboards.
- Apply each catalog version atomically and record it only after the resulting snapshot validates and persists.
- Make repeated startup and repeated reconciliation idempotent.

## Verification
- Fixtures cover untouched, edited, moved, deleted, partially installed, repeatedly upgraded, and failed-write seed states without user-data loss.

Project: [[04 Local Persistence and Seeds]]
