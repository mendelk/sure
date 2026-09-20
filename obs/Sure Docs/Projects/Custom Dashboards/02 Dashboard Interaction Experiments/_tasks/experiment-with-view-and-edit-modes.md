---
pm-task: true
projectId: "[[02 Dashboard Interaction Experiments|02 Dashboard Interaction Experiments]]"
parentId:
id: t_cd_interact_001
title: Experiment with view and edit modes
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - grid
  - experiment
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Try an explicit layout-editing mode against the accepted live dashboard and compare it with always-draggable cards.

## Ownership boundary
Own dashboard canvas and widget-shell interaction files identified by the first-slice refinement. Do not edit query, presentation, or persistence implementations.

## Acceptance criteria
- Default to a stable viewing state, expose a clear Edit layout action, and reveal drag/resize/remove affordances only while editing.
- Prototype Done and Cancel behavior using existing persistence callbacks without changing the stored shape.
- Keep report scrolling, query actions, links, and text selection usable in both approaches.
- Compare accidental movement, discoverability, pointer effort, and keyboard clarity with the previous always-editable behavior.

## Verification
- Demonstrate both behaviors in the browser at desktop width and record which one the review should keep and why.

Project: [[02 Dashboard Interaction Experiments]]
