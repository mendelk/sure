---
pm-task: true
projectId: "p_lfp_08"
parentId: "t_lfp_703"
id: "t_lfp_703_3"
title: "Manage asynchronous simulation lifecycle"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["monte-carlo", "jobs", "api"]
subtaskIds: []
dependencies: ["t_lfp_703_2"]
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Expose queued, running, completed, failed, cancelled, and stale states for long stochastic runs.

## Acceptance criteria
- Runs survive request/session loss and remain isolated by household and plan revision.
- Cancellation and failure retain the last complete result without presenting partial aggregates as final.
- Relevant plan changes mark prior runs stale and support explicit rerun.

## Verification
- Exercise cancellation, retry, concurrent runs, stale input, and worker interruption.

Project: [[08 Scenarios Risk and Optimization]]
