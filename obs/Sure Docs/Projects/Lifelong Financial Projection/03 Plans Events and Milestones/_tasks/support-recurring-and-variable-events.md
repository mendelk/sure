---
pm-task: true
projectId: "p_lfp_03"
parentId: null
id: "t_lfp_206"
title: "Support recurring and variable events"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["events", "time"]
subtaskIds: []
dependencies: ["t_lfp_202", "t_lfp_203", "t_lfp_204", "t_lfp_205"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Provide one consistent way to model irregular lifetime changes without creating dozens of near-duplicate events.

## Acceptance criteria
- Recurrence can repeat purchases, sales, income, expenses, transfers, and supported goals every N periods with start, stop, and scaling rules.
- Advanced change-over-time schedules support fixed values, fixed percentage growth, inflation plus/minus a spread, stepped values, and custom control points/sequences.
- Future starting amounts can optionally grow from today before activation.
- Event amounts, dates, tax settings, ownership, and account routing can be overridden per plan without altering current finances.
- Duplicating or moving an event between plans preserves references or reports unresolved account/milestone mappings.

## Verification
- Model career progression, a sabbatical, inflation spike, car every seven years, changing healthcare costs, and phased retirement.

Project: [[03 Plans Events and Milestones]]
