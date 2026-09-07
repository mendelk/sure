---
pm-task: true
projectId: "p_lfp_07"
parentId: "t_lfp_601"
id: "t_lfp_601_3"
title: "Support transparent custom tax models"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "custom-rules"]
subtaskIds: []
dependencies: ["t_lfp_601_2"]
timeEstimate: 16
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Let users model unsupported taxes with fixed rates, brackets, bases, time windows, and adjustments without claiming preset accuracy.

## Acceptance criteria
- Custom rules identify taxable sources, deduction behavior, owner, jurisdiction label, and effective dates.
- Results and exports distinguish maintained presets from user-authored estimates.
- Invalid or overlapping custom definitions produce actionable validation errors.

## Verification
- Model one unsupported progressive jurisdiction and one source-specific flat tax.

Project: [[07 Taxes Healthcare and Benefits]]
