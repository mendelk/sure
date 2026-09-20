---
pm-task: true
projectId: "[[02 Beta Dashboard and Transactions|02 Beta Dashboard and Transactions]]"
parentId:
id: t_alt_beta_003
title: Build net worth and balance trends
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
  - dashboard
subtaskIds: []
dependencies:
  - "[[define-core-dashboard-api-contract|Define core dashboard API contract]]"
  - "[[evaluate-tanstack-charts-for-sure-visualizations|Evaluate TanStack Charts for Sure visualizations]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:28.905Z
timeEstimate: 36
---

Visualize net worth and asset/liability trends using the chart library selected by the foundation spike.

## Acceptance criteria
- Support meaningful time ranges, typed URL search state, currency/date formatting, and comparison context.
- Provide keyboard focus, accessible summary/table fallback, localized labels, themes, reduced motion, and privacy masking.
- Handle negative values, sparse points, long ranges, resize, empty data, and upstream errors.
- Keep chart data preparation outside presentation components and avoid duplicating API calculations.

## Verification
- Storybook, component, accessibility, and responsive browser tests cover representative and edge-case datasets.
- The implementation stays within the approved chart and route performance budgets.

Project: [[02 Beta Dashboard and Transactions]]
