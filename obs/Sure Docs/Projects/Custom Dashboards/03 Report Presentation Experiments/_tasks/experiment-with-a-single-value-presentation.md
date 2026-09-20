---
pm-task: true
projectId: "[[03 Report Presentation Experiments|03 Report Presentation Experiments]]"
parentId:
id: t_cd_present_003
title: Experiment with a single-value presentation
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - reports
  - metric
  - experiment
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Test whether a small single-value report provides useful dashboard information beyond tables.

## Ownership boundary
Own one experimental presentation component and the smallest report-card field needed to select it. Do not create a renderer registry or chart framework.

## Acceptance criteria
- Let a report card choose table or single-value presentation and select one returned column for the value.
- Support explicit text, number, currency, percent, and date display choices only where the user selects them.
- Clearly handle no rows, missing selected column, null, and additional ignored rows.
- Keep raw SureQL as the source of all computation and avoid client-side aggregation.
- Compare the usefulness and required card size of the metric against the same query shown as a table.

## Verification
- Demonstrate several real aggregate queries, formatting choices, empty/error states, privacy mode, and small grid sizes in the browser.

Project: [[03 Report Presentation Experiments]]
