---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_016
title: Compose plan hub
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - planning
  - frontend
subtaskIds: []
dependencies:
  - "[[build-responsive-budget-planning-ui|Build responsive budget planning UI]]"
  - "[[build-goals-planning-ui|Build goals planning UI]]"
timeEstimate: 20
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Compose budgets and goals into one responsive planning entry point matching the intent of the existing `/plan` hub.

## Acceptance criteria
- Summarize the active budget month and goal progress with direct accessible routes to unfinished work.
- Reuse budget/goal queries without duplicate requests or competing range state.
- Provide meaningful empty, partial, read-only, loading, and error states.
- Apply privacy mode, themes, localization, mobile navigation, and performance budgets.
- Avoid introducing a third planning data model or calculations not owned by the API.

## Verification
- Component and browser tests cover populated/empty/shared states and navigation at supported viewports.

Project: [[04 Finance Planning and Reports]]
