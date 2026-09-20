---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_002
title: Isolate local dashboards by user
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - local-storage
  - privacy
subtaskIds: []
dependencies:
  - "[[capture-the-proven-local-dashboard-shape|Capture the proven local dashboard shape]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:27.951Z
timeEstimate: 6
---

Harden current-user isolation for the validated local dashboard snapshot.

## Ownership boundary
Own storage key derivation and lifecycle only. Receive the current user ID from validated SPA bootstrap data; do not inspect names, emails, DOM, or global session state.

## Acceptance criteria
- Use a stable namespaced key containing the exact current user ID and storage schema generation.
- Dispose in-memory state and listeners if the provider user changes.
- Never enumerate or merge another user's dashboard key.
- Keep seed definitions shared in source but install independent mutable snapshots per user.

## Verification
- Alternate two fixture users in one browser storage implementation and prove their dashboard/query/layout snapshots remain isolated.

Project: [[04 Local Persistence and Seeds]]
