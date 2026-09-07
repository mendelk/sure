---
pm-task: true
projectId: "p_lfp_08"
parentId: "t_lfp_704"
id: "t_lfp_704_3"
title: "Filter and inspect Monte Carlo trials"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["risk", "explainability"]
subtaskIds: []
dependencies: ["t_lfp_704_2"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Find trials by outcome, value range, and milestone behavior and inspect each one as a complete plan run.

## Acceptance criteria
- Filters support outcome band, histogram range, milestone criteria, completion timing, and selected metrics.
- Trial details expose sampled assumptions, sequence, yearly ledger, milestones, warnings, and failure reason.
- Filter counts always reconcile to the aggregate population.

## Verification
- Locate and explain representative early failure, near miss, median, and large-surplus trials.

Project: [[08 Scenarios Risk and Optimization]]
