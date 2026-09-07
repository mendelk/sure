---
pm-task: true
projectId: "p_lfp_05"
parentId: null
id: "t_lfp_404"
title: "Resolve time bindings and partial years"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "time", "milestones"]
subtaskIds: []
dependencies: ["t_lfp_205", "t_lfp_206", "t_lfp_402"]
timeEstimate: 40
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Resolve fixed dates, age-relative dates, milestone-relative offsets, recurrence, and past/current-year activity into annual effects.

## Acceptance criteria
- Income, expenses, milestones, flows, contributions, distributions, purchases, and sales support month-level starts and ends.
- Annual values prorate by overlap while discrete once-per-year events occur at most once and respect activity already completed this year.
- Negative and positive offsets from milestones resolve consistently and detect impossible/cyclic bindings.
- Events in the past contribute to fixed-date progress or current-year completion state without replaying cash flow incorrectly.
- Milestones depending on simulated values converge deterministically and report unresolved conditions.

## Verification
- Timing fixtures cover current-month starts, past annual events, simultaneous milestones, recurring events, and cyclic references.

Project: [[05 Deterministic Simulation Engine]]
