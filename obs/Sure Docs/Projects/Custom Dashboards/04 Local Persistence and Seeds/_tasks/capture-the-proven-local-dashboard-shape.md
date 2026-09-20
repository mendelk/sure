---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_001
title: Capture the proven local dashboard shape
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - local-storage
  - evolution
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Replace the prototype's loose JSON handling with validation for only the fields used by the accepted first slice.

## Ownership boundary
Own local persistence and seed files identified by the first-slice refinement. Do not change UI behavior, query execution, or grid interactions.

## Acceptance criteria
- Inventory every field read or written by the accepted screen and delete persisted fields with no consumer.
- Validate the current snapshot at the storage boundary and return an explicit invalid-data result instead of throwing into React.
- Keep dashboards, report cards, selected presentation settings, and accepted layouts serializable with stable IDs and timestamps only where behavior needs them.
- Add schema version 1 to the observed snapshot; do not design migrations for versions that never shipped.
- Keep validation and repair logic independent from React components.

## Verification
- Known-good, malformed, missing-field, unknown-field, and broken-reference snapshots exercise the actual accepted data shape.

Project: [[04 Local Persistence and Seeds]]
