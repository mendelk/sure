---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_007
title: Integrate pivot preview, save, and fallback
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - integration
  - charts
subtaskIds: []
dependencies:
  - "[[execute-pivot-aggregations-on-the-server|Execute pivot aggregations on the server]]"
  - "[[build-the-pivot-chart-configurator|Build the pivot chart configurator]]"
  - "[[render-pivot-chart-presentations|Render pivot chart presentations]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 10
---

Connect query authoring, pivot configuration, chart preview, saved cards, and table fallback into one predictable editing transaction.

## Ownership boundary

Own cross-module report-editor and report-card composition. Do not duplicate query, storage, aggregation, or rendering state machines.

## Acceptance criteria

- Track the draft query and draft pivot specification separately from the saved report and last successful card result.
- Run preview for the exact query-and-pivot pair; Save is enabled only after that pair succeeds, and Cancel restores both saved values.
- Query preview runs before field selection; pivot preview then uses the selected fields and shows chart plus equivalent grouped table.
- A failed, stale, or superseded pivot request leaves the saved card result intact and cannot overwrite a newer preview.
- Missing fields, unsupported configuration, empty result, cardinality warning, and execution error each produce a distinct actionable state.
- Table presentation remains available; invalid saved pivot configuration falls back to the ordinary query table without hiding data or breaking sibling cards.

## Verification

- Use the real route to cover create, configure, preview, save, cancel, edit query, edit chart only, switch presentation, rapid repeated preview, failure after success, refresh, and dashboard switching.

Project: [[06 Pivot Chart Experience]]
