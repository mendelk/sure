---
pm-task: true
projectId: "p_cd_productize"
parentId: null
id: "t_cd_product_002"
title: "Integrate the selected dashboard experience"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "integration", "dashboard"]
subtaskIds: []
dependencies: ["t_cd_product_001"]
timeEstimate: 10
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Compose the selected dashboard navigation, grid interactions, report editing, presentations, and local persistence into one coherent product flow.

## Ownership boundary
This task owns cross-lane page composition. Use lane-owned public components/callbacks as they emerged; do not duplicate state or reach around validated persistence.

## Acceptance criteria
- A user can create a dashboard, create or add a SureQL report card, preview and save its query, select its presentation, arrange it, and return after refresh.
- Dashboard switching, browser navigation, resets, storage-health messages, and report request state agree on the active dashboard and card.
- Canceling a multi-step action leaves no orphan card or partial persisted state.
- One failing report leaves other cards and dashboard management usable.
- The actual `/dashboards` route contains no experiment selector or review-only controls.

## Verification
- Complete the full selected flow in a browser with real authorized data, then repeat from a fresh seeded user and an existing customized user.

Project: [[05 Productize the Proven Direction]]
