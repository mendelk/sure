---
pm-task: true
projectId: "p_lfp_13"
parentId: "t_lfp_1202"
id: "t_lfp_1202_2"
title: "Enforce ownership, tax, and timing invariants"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "invariants", "tax"]
subtaskIds: []
dependencies: ["t_lfp_1202_1"]
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Prove that ownership, filing, withholding, tax liability, milestone timing, and survivor transitions stay consistent.

## Acceptance criteria
- Person and joint totals reconcile before and after marriage, move, and death.
- Withholding changes remittance timing but not total liability for equivalent facts.
- Date shifts affect only periods with changed economic overlap or rules.

## Verification
- Run generated boundary cases around dates, ages, locations, filing, and ownership changes.

Project: [[13 Validation and Rollout]]
