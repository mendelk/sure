---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_013
title: Build responsive budget planning UI
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - budgets
  - frontend
  - forms
subtaskIds: []
dependencies:
  - "[[complete-budget-write-api|Complete budget write API]]"
  - "[[evaluate-tanstack-charts-for-sure-visualizations|Evaluate TanStack Charts for Sure visualizations]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:44.605Z
timeEstimate: 40
---

Build month navigation, budget summaries, allocation editing, category grouping/movement, owner switching, sharing, and copy-previous UI.

## Acceptance criteria
- Encode month/owner in typed route state and use server totals for allocated, actual, and available values.
- Provide accessible desktop and mobile editing with decimal-safe inputs and clear over-allocation warnings.
- Show budget progress charts with non-visual alternatives, privacy mode, themes, and localized currency.
- Handle absent budgets/categories, stale conflicts, shared/read-only roles, optimistic rollback, and copy confirmation.
- Update transaction/category changes without full-page refresh.

## Verification
- Component and Rails-backed tests cover allocation, movement, copy, sharing, owner switch, warnings, keyboard use, and mobile layout.

Project: [[04 Finance Planning and Reports]]
