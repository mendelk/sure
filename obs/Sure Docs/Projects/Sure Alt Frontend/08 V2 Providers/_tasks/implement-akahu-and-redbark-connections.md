---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_011"
title: "Implement Akahu and Redbark connections"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement Akahu and Redbark connection, account-selection/linking, setup, sync, and disconnect flows.

## Acceptance criteria
- Follow the audited provider transitions and callback/credential security controls.
- Preserve provider-specific institution/account metadata and account compatibility validation.
- Handle cancellation, expiry, no-account, duplicate, partial setup, and recoverable provider errors.
- Keep all credentials and raw provider payloads out of browser persistence and diagnostics.
- Provide accessible responsive steps using the shared provider shell.

## Verification
- Minitest, docs-only rswag/OpenAPI, component, and Rails-backed Playwright coverage passes for both providers.

Project: [[08 V2 Providers]]
