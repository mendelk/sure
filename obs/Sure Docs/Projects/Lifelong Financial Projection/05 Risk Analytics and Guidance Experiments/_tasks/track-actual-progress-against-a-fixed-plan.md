---
pm-task: true
projectId: "[[05 Risk Analytics and Guidance Experiments|05 Risk Analytics and Guidance Experiments]]"
parentId:
id: t_lfp_risk_006
title: Track actual progress against a fixed plan
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - progress
  - baseline
  - analytics
subtaskIds: []
dependencies:
  - "[[deliver-yearly-summary-and-plan-analytics|Deliver yearly summary and plan analytics]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:59.040Z
timeEstimate: 8
---

Compare current Sure finances with a deliberately fixed plan rather than silently moving the target after every sync.

## Ownership boundary
Read live financial data and append local comparison snapshots only. Do not create server planning history yet.

## Acceptance criteria
- Show actual versus planned balances, savings, spending, goal status, and selected metrics by date.
- Preserve the plan baseline and require an explicit refresh or replan action.
- Explain mapping gaps, missing accounts, currency changes, and stale values.
- Keep progress snapshots exportable with the local plan.

## Verification
- Advance fixture data across dates, compare to an unchanged plan, then explicitly refresh and confirm the prior comparison remains understandable.

Project: [[05 Risk Analytics and Guidance Experiments]]
