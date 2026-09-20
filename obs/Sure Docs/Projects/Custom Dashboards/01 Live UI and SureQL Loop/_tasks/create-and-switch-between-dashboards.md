---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_006
title: Create and switch between dashboards
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - dashboard
  - walking-slice
subtaskIds: []
dependencies:
  - "[[add-and-remove-live-report-cards|Add and remove live report cards]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T16:04:47.621Z
timeEstimate: 10
---

Extend the working snapshot to multiple named dashboards and learn what users need to navigate them.

## Ownership boundary
Own the prototype's page-local dashboard array and simple switcher. Avoid general CRUD abstractions; implement only create, rename, switch, and delete behavior visible on this screen.

## Acceptance criteria
- Create an empty named dashboard, switch between dashboards, rename the active dashboard, and delete after confirmation.
- Give dashboards stable IDs and preserve each dashboard's report cards and grid layout independently.
- Keep the active dashboard in URL search state so refresh and browser back/forward behavior can be evaluated.
- If the selected ID is missing, choose a deterministic surviving dashboard; show a clear create-first state when none remain.
- Persist the plain dashboard array in the current user's prototype snapshot.

## Verification
- Create two dashboards with different live reports/layouts, switch using the UI and browser history, rename/delete, and refresh.

Project: [[01 Live UI and SureQL Loop]]
