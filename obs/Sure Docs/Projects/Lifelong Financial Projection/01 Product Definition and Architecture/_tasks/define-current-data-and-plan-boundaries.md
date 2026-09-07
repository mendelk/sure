---
pm-task: true
projectId: "p_lfp_01"
parentId: null
id: "t_lfp_003"
title: "Define current-data and plan boundaries"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["architecture", "integration"]
subtaskIds: []
dependencies: ["t_lfp_001", "t_lfp_002"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define how live Sure financial data becomes plan starting conditions while preserving plans as editable scenarios rather than forecasts that mutate with every sync.

## Acceptance criteria
- A plan can inherit a current snapshot or own custom starting conditions that differ from current finances.
- Users can see which values are inherited, overridden, stale, or no longer backed by a live account.
- Refreshing a baseline presents a reviewable change set and never silently rewrites scenario assumptions or historical results.
- Account ownership, sharing, exclusions, currencies, tax treatment, holdings, debts, and goal earmarks have explicit projection behavior.
- Projection records are clearly separated from posted transactions and do not alter historical reports or account balances.

## Verification
- Document update behavior for synced balance changes, closed accounts, renamed accounts, ownership changes, and plans intentionally frozen in the past.

Project: [[01 Product Definition and Architecture]]
