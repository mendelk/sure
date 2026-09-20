---
pm-task: true
projectId: "p_cd_live"
parentId: null
id: "t_cd_live_003"
title: "Remember one dashboard in local storage"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "local-storage", "walking-slice"]
subtaskIds: []
dependencies: ["t_cd_live_002"]
timeEstimate: 6
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Persist the exact working screen so iteration survives refresh, without predicting the final storage model.

## Ownership boundary
Own a small feature-local persistence helper used only by the first page. Do not introduce normalized entities, schemas for hypothetical fields, repositories, migrations, or cross-tab synchronization.

## Acceptance criteria
- Save one JSON snapshot containing only the current dashboard title, report title/source, and current grid position/size.
- Namespace the key with a product prefix and authenticated bootstrap user ID so two users in one browser do not share the prototype.
- Read defensively; malformed or unavailable storage falls back to the starter screen without blocking query execution.
- Write after explicit query save and drag/resize stop, not on every keystroke or pointer move.
- Reloading `/dashboards` restores the query and grid layout exactly enough for continued experimentation.

## Verification
- Edit, run, move, resize, refresh, and confirm the same screen returns; then sign in as another fixture user and confirm isolation.

Project: [[01 Live UI and SureQL Loop]]
