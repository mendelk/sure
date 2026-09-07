---
pm-task: true
projectId: "p_lfp_08"
parentId: null
id: "t_lfp_701"
title: "Compare plans and run reversible what-if changes"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["scenarios", "compare"]
subtaskIds: []
dependencies: ["t_lfp_201", "t_lfp_405"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Compare saved plans or test temporary changes against an immutable baseline without losing either state.

## Acceptance criteria
- Users can compare two saved plans or enter a temporary what-if session on one plan.
- Comparisons align different start/end dates and show absolute/percentage deltas for selected metrics, years, milestones, and line items.
- Baseline and changed assumptions, events, notable milestones, and trajectories remain distinguishable in structured output.
- A what-if session can be reverted, applied to the current plan, or saved as a new plan atomically.
- Navigating away or encountering a failed run cannot silently commit or discard pending changes.

## Verification
- Cover income, retirement age, spending, home purchase, returns, and tax-strategy changes across plans with different dates.

Project: [[08 Scenarios Risk and Optimization]]
