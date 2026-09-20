---
pm-task: true
projectId: "[[03 Report Presentation Experiments|03 Report Presentation Experiments]]"
parentId:
id: t_cd_present_004
title: Compare inline and focused report editing
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
  - editor
  - experiment
subtaskIds: []
dependencies:
  - "[[improve-the-live-sureql-editing-loop|Improve the live SureQL editing loop]]"
  - "[[exercise-the-table-with-real-result-shapes|Exercise the table with real result shapes]]"
  - "[[experiment-with-a-single-value-presentation|Experiment with a single-value presentation]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Compare editing directly inside report cards with a focused dialog or drawer using the proven query and presentation controls.

## Ownership boundary
Own experimental editor composition only. Reuse existing query and presentation components; do not duplicate their state machines.

## Acceptance criteria
- Keep the inline path available long enough to compare it against one focused editing surface.
- Evaluate space for query text/errors/results, relationship to the card being edited, focus behavior, unsaved-change handling, and phone usability.
- Both variants must run the same draft and save through the same existing callbacks.
- Avoid adding a general modal framework or permanent feature flag for the comparison.

## Verification
- Review both variants using short and long queries, compile errors, table and single-value reports, keyboard-only use, and phone width.

Project: [[03 Report Presentation Experiments]]
