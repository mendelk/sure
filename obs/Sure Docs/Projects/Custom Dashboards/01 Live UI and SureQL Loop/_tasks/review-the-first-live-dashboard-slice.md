---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_007
title: Review the first live dashboard slice
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - product-review
  - dashboard
  - checkpoint
subtaskIds: []
dependencies:
  - "[[create-and-switch-between-dashboards|Create and switch between dashboards]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:55:49.454Z
timeEstimate: 4
---

Use the working browser experience to decide the next direction before hardening architecture or storage.

## Ownership boundary
Own the review checkpoint, not new infrastructure. Record decisions in this task's completion notes and update later task acceptance criteria when a reviewed choice invalidates them.

## Acceptance criteria
- Demonstrate query editing, real results, multiple report cards, drag/resize, multiple dashboards, refresh, and reset on the actual route.
- Decide whether report editing stays inline or moves to a focused surface, whether layout needs explicit edit mode, and which first presentations matter.
- Identify fields actually used by the live snapshot and remove proposed fields with no demonstrated UI need.
- List interaction problems and data-loss risks observed during use, ranked by impact.
- Explicitly mark behaviors as keep, change, or defer; do not approve abstractions by name alone.

## Verification
- The checkpoint is complete only after an interactive browser review and concrete keep/change/defer decisions are attached to the task.

Project: [[01 Live UI and SureQL Loop]]
