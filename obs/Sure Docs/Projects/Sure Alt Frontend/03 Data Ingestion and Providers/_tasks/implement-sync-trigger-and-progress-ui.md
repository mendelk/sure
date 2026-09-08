---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_beta_009"
title: "Implement sync trigger and progress UI"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "sync", "api"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_ing_003", "t_alt_fnd_004", "t_alt_fnd_010", "t_alt_fnd_012", "t_alt_fnd_018"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Let users trigger a family sync and understand its progress, completion, and recoverable failures.

## Acceptance criteria
- Use existing sync create/index/latest/show operations, extending the contract only for essential status details.
- Prevent duplicate triggers, poll with bounded adaptive intervals, pause when hidden/offline, and stop at terminal state.
- Announce progress accessibly without noisy live-region updates and show provider-safe error summaries.
- Refresh dashboard, account, balance, holdings, and transaction queries once after successful completion.
- Distinguish queued, syncing, partial, completed, failed, stale, rate-limited, and disconnected states.

## Verification
- Fake-time tests cover polling lifecycle; Rails-backed Playwright covers trigger, progress, completion, and failure recovery.

Project: [[03 Data Ingestion and Providers]]
