---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_013"
title: "Build responsive budget planning UI"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["budgets", "frontend", "forms"]
subtaskIds: []
dependencies: ["t_alt_fin_012", "t_alt_fnd_016"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
