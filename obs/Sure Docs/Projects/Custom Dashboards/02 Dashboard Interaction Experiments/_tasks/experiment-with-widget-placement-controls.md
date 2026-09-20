---
pm-task: true
projectId: "p_cd_interactions"
parentId: null
id: "t_cd_interact_003"
title: "Experiment with widget placement controls"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "grid", "experiment"]
subtaskIds: []
dependencies: ["t_cd_interact_001"]
timeEstimate: 8
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Find understandable ways to add, move, resize, and remove report cards without making the canvas feel like an editor at all times.

## Ownership boundary
Own grid placement controls and local layout behavior. Receive report summaries through current props; do not change report definitions or query execution.

## Acceptance criteria
- Try a minimal add-report entry point and a deterministic empty-space placement for a selected existing report card definition.
- Keep a visible pointer drag handle while also providing keyboard move and resize actions for the active card.
- Prevent overlap, off-grid positions, unusably small cards, and accidental removal.
- Preserve logical DOM/focus order independently from visual coordinates.

## Verification
- Use mouse and keyboard to add, move, resize, and remove cards; record friction and the selected controls for productization.

Project: [[02 Dashboard Interaction Experiments]]
