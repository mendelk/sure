---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_005
title: Handle local storage failures and conflicts
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
  - resilience
subtaskIds: []
dependencies:
  - "[[isolate-local-dashboards-by-user|Isolate local dashboards by user]]"
  - "[[add-versioned-non-destructive-seeds|Add versioned non-destructive seeds]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:32.270Z
timeEstimate: 10
---

Keep the accepted dashboard usable when browser storage is blocked, malformed, full, or changed in another tab.

## Ownership boundary
Own persistence health and storage-event behavior. Expose simple status/actions to UI; do not redesign the dashboard screen.

## Acceptance criteria
- Fall back to an in-memory seeded session for blocked, malformed, or quota-failed storage and clearly mark changes as non-durable.
- Preserve one bounded recovery copy of malformed raw data when possible instead of silently overwriting it.
- Listen only to the current user's exact key and accept newer validated revisions from another tab.
- Detect conflicting newer edits rather than applying last-writer-wins silently; offer reload/export/retry actions.
- Avoid retry loops, unbounded backups, polling, and new synchronization dependencies.

## Verification
- A two-tab browser harness simulates blocked access, malformed JSON, quota failure, newer edits, stale events, conflict, retry, and user isolation.

Project: [[04 Local Persistence and Seeds]]
