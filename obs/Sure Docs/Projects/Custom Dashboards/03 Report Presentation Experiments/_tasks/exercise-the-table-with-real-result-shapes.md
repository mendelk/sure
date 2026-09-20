---
pm-task: true
projectId: "[[03 Report Presentation Experiments|03 Report Presentation Experiments]]"
parentId:
id: t_cd_present_002
title: Exercise the table with real result shapes
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - reports
  - table
  - experiment
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:27.517Z
timeEstimate: 8
---

Use several real SureQL queries to find what the default result table genuinely needs.

## Ownership boundary
Own the existing result-table component and display helpers only. Do not infer application models or add a generalized renderer layer.

## Acceptance criteria
- Exercise transaction-like, account-like, aggregate, mixed-type, empty, wide, and truncated query results.
- Preserve returned column order and safely display null, booleans, numbers, dates, and long text without injecting HTML.
- Contain horizontal and vertical overflow inside the card and keep headers associated with cells.
- Use conservative value display unless the current report explicitly supplies a tested format choice.
- Record table configuration that users actually request during review; do not add speculative sorting, grouping, or pagination.

## Verification
- Visually review the real result shapes in narrow, medium, and wide cards plus light and dark themes.

Project: [[03 Report Presentation Experiments]]
