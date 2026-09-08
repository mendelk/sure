---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_beta_003"
title: "Build net worth and balance trends"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "charts", "dashboard"]
subtaskIds: []
dependencies: ["t_alt_beta_001", "t_alt_fnd_016"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
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

Project: [[04 Finance Planning and Reports]]
