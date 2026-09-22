---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_003
title: Remember one plan in local storage
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - local-storage
  - plan
  - walking-slice
subtaskIds: []
dependencies:
  - "[[make-core-projection-assumptions-editable|Make core projection assumptions editable]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:47.067Z
timeEstimate: 6
---

Preserve the first useful plan across reloads without committing to server records or database tables.

## Ownership boundary
Own one feature-local localStorage key scoped to the signed-in user. No Active Record model, API endpoint, repository layer, synchronization, or migration.

## Acceptance criteria
- Save only the baseline reference, accepted assumptions, and minimal display state used by the route.
- Restore the plan after reload and fall back safely when local data is absent or malformed.
- Keep browser plans separated by current-user identity without treating localStorage as an authorization boundary.
- Never write projection values back to accounts, transactions, holdings, or historical reports.

## Verification
- Edit the plan, reload the browser, switch between two fixture users, corrupt the local value, and confirm isolation plus safe recovery.

Project: [[01 Live Projection Loop]]
