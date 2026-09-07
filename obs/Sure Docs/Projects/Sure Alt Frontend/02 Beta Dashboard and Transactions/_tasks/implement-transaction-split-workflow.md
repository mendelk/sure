---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_008"
title: "Implement transaction split workflow"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "transactions", "forms"]
subtaskIds: []
dependencies: ["t_alt_beta_006", "t_alt_beta_007"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Implement transaction splitting with exact arithmetic and explicit reconciliation to the parent amount.

## Acceptance criteria
- Add/remove split rows and edit amount, category, notes, and other fields supported by the API.
- Display allocated and remaining totals in the transaction currency using decimal-safe calculations.
- Prevent submission when rows are invalid or totals do not reconcile according to backend rules.
- Preserve entered rows after validation/network failures and update all affected transaction/dashboard queries on success.
- Provide accessible row controls and a usable mobile layout.

## Verification
- Tests cover positive/negative amounts, rounding, many rows, validation, keyboard flow, mobile layout, and Rails persistence.

Project: [[02 Beta Dashboard and Transactions]]
