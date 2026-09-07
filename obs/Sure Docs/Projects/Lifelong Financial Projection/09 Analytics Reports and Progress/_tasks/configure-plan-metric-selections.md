---
pm-task: true
projectId: "p_lfp_09"
parentId: "t_lfp_801"
id: "t_lfp_801_3"
title: "Configure plan metric selections"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "preferences"]
subtaskIds: []
dependencies: ["t_lfp_801_2"]
timeEstimate: 16
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Persist which metrics a household wants to see and how configurable metric formulas should behave.

## Acceptance criteria
- Users can select, order, hide, auto-filter, and restore metrics per plan or saved analysis.
- Configurable spending, liquidity, savings, and tax-rate definitions preserve explicit included components.
- Preferences never change the underlying ledger or unrelated metric values.

## Verification
- Round-trip custom selections and prove calculation changes affect only dependent metrics.

Project: [[09 Analytics Reports and Progress]]
