---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_005
title: Build the pivot chart configurator
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - charts
  - accessibility
subtaskIds: []
dependencies:
  - "[[return-typed-sureql-field-metadata|Return typed SureQL field metadata]]"
  - "[[version-and-migrate-pivot-chart-configuration|Version and migrate pivot chart configuration]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 12
---

Let users configure a pivot chart from the exact fields returned by their current SureQL draft.

## Ownership boundary

Own report-editor controls and draft pivot state. Reuse existing form, button, modal, and disclosure primitives; do not add global styles or make drag-and-drop the only configuration path.

## Acceptance criteria

- After a successful query preview, expose category, optional date bucket, optional series, measure, aggregation, chart type, sort, top-N, and format controls using server field metadata.
- Support the V1 shape exactly: one category; one measure plus optional series, or up to three measures without series.
- Filter or disable incompatible choices with an adjacent reason; automatically chosen defaults remain visible and editable.
- Keep field controls fully keyboard-operable, labelled, ordered semantically, and usable at 200 percent zoom and phone width.
- Changing the query marks chart choices stale until the exact draft runs again; preserve still-valid choices and clearly identify missing fields.
- Show a concise configuration summary and an equivalent grouped-data table in the focused report editor.

## Verification

- Configure monthly line, grouped category bar, stacked category bar, count-only, multiple-measure, empty, and incompatible examples using keyboard, pointer, narrow viewport, and light/dark themes.

Project: [[06 Pivot Chart Experience]]
