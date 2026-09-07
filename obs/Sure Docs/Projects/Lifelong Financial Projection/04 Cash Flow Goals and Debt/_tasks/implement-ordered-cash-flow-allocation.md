---
pm-task: true
projectId: "p_lfp_04"
parentId: null
id: "t_lfp_301"
title: "Implement ordered cash-flow allocation"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["cash-flow", "flows"]
subtaskIds: []
dependencies: ["t_lfp_202", "t_lfp_203", "t_lfp_103"]
timeEstimate: 40
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Allocate available income through an ordered list of obligations and goals before resolving surplus or shortfall.

## Acceptance criteria
- Flows execute top-to-bottom and distinguish mandatory/fixed allocations from allocations that consume only remaining income.
- Amount strategies include maximize, fixed amount by frequency, percentage of salary, percentage of remaining income, percentage of balance, and contribution to a target.
- Contribution limits, employer contributions, payroll deductions, taxes, and account eligibility constrain allocations.
- Catch-all behavior explicitly saves anything left over to cash, invests it through a chosen flow, or records it as discretionary spending.
- Each year's ledger explains requested, funded, limited, skipped, and unfunded amounts by flow.

## Verification
- Allocation fixtures prove order sensitivity, partial funding, limit handling, mandatory goals, and both leftover philosophies.

Project: [[04 Cash Flow Goals and Debt]]
