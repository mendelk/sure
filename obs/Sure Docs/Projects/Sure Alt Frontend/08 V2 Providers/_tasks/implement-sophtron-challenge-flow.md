---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_012"
title: "Implement Sophtron challenge flow"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "mfa", "api"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement Sophtron institution connection, manual-sync configuration, MFA challenge, status polling, account setup, sync, and disconnect.

## Acceptance criteria
- Model institution selection, credential submission, challenge prompts, challenge response, connection status, timeout, retry, and cancellation explicitly.
- Bind challenge attempts to the initiating session and prevent replay or cross-user access.
- Never persist or log credentials/challenge answers in the browser or server diagnostics.
- Support account selection/linking and provider-specific subtype setup after authentication.
- Provide accessible status announcements without excessive polling/live-region noise.

## Verification
- Tests cover challenge success, wrong/expired answer, timeout, restart, manual sync toggle, account setup, and disconnect.

Project: [[08 V2 Providers]]
