---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_011"
title: "Harden beta offline error and session behavior"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["beta", "pwa", "reliability"]
subtaskIds: []
dependencies: ["t_alt_beta_008", "t_alt_beta_010", "t_alt_fnd_013", "t_alt_fnd_014"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Make the complete beta slice behave coherently through connectivity changes, expired sessions, API failures, and updates.

## Acceptance criteria
- Exercise every beta query/mutation under offline, timeout, 401/403/404/409/422/429, 5xx, and malformed-response conditions.
- Preserve safe form input while never queueing financial writes offline.
- Route terminal auth failures to login without redirect loops and return users to an allowed destination after reauthentication.
- Ensure service-worker updates, route errors, and retries cannot duplicate mutations or expose stale private data across logout.
- Add actionable messages and correlation IDs without exposing upstream payloads.

## Verification
- Automated fault-injection scenarios pass at desktop and mobile widths against mock and real API boundaries.

Project: [[02 Beta Dashboard and Transactions]]
