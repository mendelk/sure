---
pm-task: true
projectId: "p_lfp_12"
parentId: null
id: "t_lfp_1109"
title: "Coordinate contracts with Sure Alt Frontend"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["integration", "frontend", "contracts"]
subtaskIds: []
dependencies: ["t_lfp_1108", "t_lfp_801"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Keep this financial-functionality project independent from `Sure Alt Frontend` while documenting the contracts that frontend work will consume.

## Acceptance criteria
- Planning domain objects, API resources, asynchronous states, metric definitions, warning semantics, and authorization boundaries have stable consumer-facing contracts.
- Each staged release identifies the minimum frontend touchpoints needed to access completed functionality without prescribing layout, styling, or component implementation here.
- Changes that affect existing finance-planning/report tasks in `Sure Alt Frontend` are recorded as explicit cross-project dependencies or compatibility notes.
- Frontend-specific enhancement requests remain in the frontend project rather than expanding this project's financial scope.
- Contract fixtures allow an alternate frontend to validate compatibility without duplicating simulation logic.

## Verification
- Review each public planning workflow against Rails web and API contracts and record unresolved frontend dependencies before release.

Project: [[12 Onboarding Portability and Platform]]
