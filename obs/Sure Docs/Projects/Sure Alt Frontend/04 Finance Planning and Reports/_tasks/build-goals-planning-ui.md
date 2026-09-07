---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_015"
title: "Build goals planning UI"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["goals", "frontend", "charts"]
subtaskIds: []
dependencies: ["t_alt_fin_014", "t_alt_fnd_016"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build goal list/detail/forms, funding breakdown, projection, consumption, lifecycle, and pledge workflows.

## Acceptance criteria
- Present progress and projection with accessible chart/table/text alternatives and clear assumption labels.
- Use TanStack Form for goal/pledge/consumption validation and preserve input on server errors.
- Expose only server-allowed lifecycle actions with confirmation for destructive or value-changing transitions.
- Support active/paused/completed/archived states, empty funding, insufficient funds, stale data, privacy mode, and mobile layouts.
- Refresh account/goal/plan data narrowly after mutations.

## Verification
- Rails-backed Playwright covers create/edit/fund/consume/pause/resume/complete/archive/reopen and pledge renew/delete.

Project: [[04 Finance Planning and Reports]]
