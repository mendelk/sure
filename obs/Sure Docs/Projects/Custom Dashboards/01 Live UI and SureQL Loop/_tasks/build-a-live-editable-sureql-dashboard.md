---
pm-task: true
projectId: "p_cd_live"
parentId: null
id: "t_cd_live_001"
title: "Build a live editable SureQL dashboard"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "sureql", "walking-slice"]
subtaskIds: []
dependencies: []
timeEstimate: 10
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Make the first implementation visible and useful: `/dashboards` shows a raw SureQL editor, a Run action, and real authorized query results.

## Ownership boundary
Own the smallest route, SPA bootstrap addition, and one local dashboard page component needed for this slice. Keep code together; do not create a dashboard domain layer, repository interface, renderer registry, or migration system.

## Acceptance criteria
- Serve `/dashboards` through the existing authenticated React SPA and add one navigation path without replacing the Rails home dashboard.
- Start with a readable SureQL query against a curated source, allow direct editing in a labelled textarea, and run only on an explicit action.
- Reuse the existing `dashboard/monarch/run` behavior through a bootstrapped generated path and existing `Sureql::Executor`; do not create a second query engine or execute client-generated SQL.
- Render returned columns and rows in a basic semantic table and show loading, empty, truncation, and server-error states.
- Keep the implementation intentionally specific to this screen so the first browser review can change its shape cheaply.

## Verification
- Open the actual `/dashboards` route, change the query, run it against fixture-backed real data, and visibly confirm the result and an invalid-query error.

Project: [[01 Live UI and SureQL Loop]]
