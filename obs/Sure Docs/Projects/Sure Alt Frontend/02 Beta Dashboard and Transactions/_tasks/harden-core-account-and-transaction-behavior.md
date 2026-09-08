---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_011"
title: "Harden core account and transaction behavior"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["core", "accounts", "transactions", "reliability"]
subtaskIds: []
dependencies: ["t_alt_fin_002", "t_alt_beta_002", "t_alt_beta_006", "t_alt_beta_007", "t_alt_fnd_019", "t_alt_fnd_020", "t_alt_fnd_021"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Make manual account and everyday transaction workflows behave coherently through connectivity changes, expired sessions, and API failures without waiting for PWA, dashboard, sync, or chart work.

## Acceptance criteria
- Exercise every beta query/mutation under offline, timeout, 401/403/404/409/422/429, 5xx, and malformed-response conditions.
- Preserve safe form input while never queueing financial writes offline.
- Route terminal auth failures to login without redirect loops and return users to an allowed destination after reauthentication.
- Ensure route errors and retries cannot duplicate mutations or expose stale private data across logout.
- Add actionable messages and correlation IDs without exposing upstream payloads.

## Verification
- Automated fault-injection scenarios pass at desktop and mobile widths against mock and real API boundaries.

Project: [[02 Beta Dashboard and Transactions]]
