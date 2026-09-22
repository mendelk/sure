---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_006
title: Render pivot chart presentations
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
  - "[[execute-pivot-aggregations-on-the-server|Execute pivot aggregations on the server]]"
  - "[[version-and-migrate-pivot-chart-configuration|Version and migrate pivot chart configuration]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 12
---

Render explicit pivot results instead of guessing one date and one numeric column.

## Ownership boundary

Own application chart mapping, line/grouped-bar/stacked-bar renderers, legend, axes, tooltip, and accessible data-table disclosure. Keep TanStack Charts types inside these modules.

## Acceptance criteria

- Render ordered line, grouped-bar, and stacked-bar charts for every valid V1 result shape without re-aggregating or sorting raw rows in the browser.
- Use selected labels and formats consistently across axes, legend, tooltip, summary, privacy masking, and accessible table.
- Handle negative, zero, null, large, fractional, and mixed-sign values without misleading scales or stacks.
- Provide a chart name and concise text description plus a semantic table containing the same grouped values; the visual chart is never the only way to read the data.
- Resize within dashboard cards without page-level overflow, preserve readable labels at supported card sizes, and honor theme and reduced-motion preferences.
- Isolate chart-library configuration so replacing or upgrading the alpha dependency does not change persisted report data.

## Verification

- Visually exercise every supported shape and edge case in small, medium, and wide cards; compare tooltip, table, and server result values exactly.

Project: [[06 Pivot Chart Experience]]
