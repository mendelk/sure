---
pm-task: true
projectId: "[[04 Local Persistence and Seeds|04 Local Persistence and Seeds]]"
parentId:
id: t_cd_persist_006
title: Verify the local persistence lifecycle
type: task
status: "done"
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - verification
  - local-storage
  - seeds
subtaskIds: []
dependencies:
  - "[[add-explicit-seed-reset-controls|Add explicit seed reset controls]]"
  - "[[handle-local-storage-failures-and-conflicts|Handle local storage failures and conflicts]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:33.500Z
timeEstimate: 6
---

Prove the local-first lifecycle protects real dashboard customizations before final integration.

## Ownership boundary
Own persistence verification and fixes within persistence/seed files only. Do not patch UI consumers around invalid storage behavior.

## Acceptance criteria
- Exercise first install, customization, refresh, seed addition, intentional deletion, current-seed reset, full reset, blocked storage, corruption recovery, cross-tab update, conflict, and two-user isolation.
- Verify every successful durable transition leaves one current validated snapshot and repeated startup makes no changes.
- Confirm query execution remains available during in-memory fallback and another user's key remains byte-for-byte unchanged.

## Verification
- Run the lifecycle against real browser localStorage and retain focused deterministic checks for migration, reconciliation, reset, and data-loss boundaries.

Project: [[04 Local Persistence and Seeds]]
