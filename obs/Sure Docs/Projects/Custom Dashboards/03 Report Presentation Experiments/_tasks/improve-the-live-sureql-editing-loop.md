---
pm-task: true
projectId: "[[03 Report Presentation Experiments|03 Report Presentation Experiments]]"
parentId:
id: t_cd_present_001
title: Improve the live SureQL editing loop
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - sureql
  - experiment
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:25.856Z
timeEstimate: 8
---

Improve raw SureQL authoring from observed use without choosing a general report API.

## Ownership boundary
Own query editor and request-state files separated by the first-slice refinement. Do not edit dashboard navigation, grid behavior, or persistence helpers.

## Acceptance criteria
- Keep draft query text separate from the last saved query and last successful result.
- Run previews the exact draft; Save succeeds only after that draft executes successfully; Cancel restores the saved query.
- Keep compile and execution errors beside the editor without replacing the last successful card result.
- Prevent duplicate Run/Save requests and ignore late responses from superseded drafts.
- Expose generated SQL only in an optional technical disclosure so it does not dominate normal editing.

## Verification
- Browser use covers successful preview/save, invalid query, rapid repeated Run, Cancel, refresh, and a slow superseded response.

Project: [[03 Report Presentation Experiments]]
