---
pm-task: true
projectId: "[[02 Dashboard Interaction Experiments|02 Dashboard Interaction Experiments]]"
parentId:
id: t_cd_interact_002
title: Improve dashboard switching and management
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - dashboard
  - experiment
subtaskIds: []
dependencies:
  - "[[experiment-with-view-and-edit-modes|Experiment with view and edit modes]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Explore a clear navigation and management surface using multiple real dashboards.

## Ownership boundary
Own dashboard selector/list and create/rename/delete controls only. Use existing callbacks; do not mutate saved snapshots directly.

## Acceptance criteria
- Make the active dashboard and available alternatives obvious without crowding the report canvas.
- Keep direct URL selection and browser back/forward behavior visible during the experiment.
- Provide keyboard-operable create, rename, and confirmed delete flows with predictable focus restoration.
- Exercise zero, one, several, and long-named dashboards before choosing list, tabs, dropdown, or another existing project pattern.

## Verification
- Browser review covers the four collection sizes at desktop and phone widths and records the selected navigation pattern.

Project: [[02 Dashboard Interaction Experiments]]
