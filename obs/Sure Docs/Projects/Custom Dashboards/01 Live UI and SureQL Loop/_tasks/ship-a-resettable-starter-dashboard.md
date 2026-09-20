---
pm-task: true
projectId: "p_cd_live"
parentId: null
id: "t_cd_live_004"
title: "Ship a resettable starter dashboard"
type: "task"
status: "done"
priority: "high"
start: ""
due: ""
progress: 100
assignees: []
tags: ["frontend", "seeds", "walking-slice"]
subtaskIds: []
dependencies: ["t_cd_live_003"]
timeEstimate: 6
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Make first use and repeated design review deterministic with one source-controlled starter dashboard.

## Ownership boundary
Own one plain seed fixture and a reset action near the prototype persistence helper. Do not add version reconciliation or a general seed framework yet.

## Acceptance criteria
- Define one stable starter snapshot with a useful SureQL table report and a usable initial grid size.
- Install it only when the current user's prototype key is absent.
- Provide an explicitly confirmed Reset starter dashboard action that replaces only this feature's current-user snapshot.
- Keep the seed independent from fixture IDs, current dates, random values, and developer-local data.
- Allow users to edit every seeded value after installation.

## Verification
- Clear the feature key, load the seed, customize it, refresh, reset it, and visibly confirm the deterministic starter state returns.

Project: [[01 Live UI and SureQL Loop]]
