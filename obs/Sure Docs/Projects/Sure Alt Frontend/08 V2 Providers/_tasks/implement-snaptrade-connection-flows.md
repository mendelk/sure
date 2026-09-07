---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_006"
title: "Implement SnapTrade connection flows"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "frontend", "api"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement SnapTrade OAuth, device authorization, connection selection, account linking/setup, sync, and disconnection.

## Acceptance criteria
- Support browser OAuth and device-code paths with expiring status polling and cancellation.
- Implement connection listing/deletion and imported-to-existing account mapping from the audited state machine.
- Keep provider tokens and user secrets out of browser state, URLs, logs, and artifacts.
- Make retries/idempotency safe across callback refreshes and interrupted device flows.
- Provide accessible status, timeout, error, and recovery UI on desktop and mobile.

## Verification
- Rails behavior/docs contracts and frontend Playwright tests cover OAuth, device flow, account setup, timeout, retry, and disconnect.

Project: [[08 V2 Providers]]
