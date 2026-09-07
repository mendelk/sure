---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_009"
title: "Implement brokerage provider connections"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "investments", "api"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement Questrade, IBKR, Trading 212, and Indexa Capital connection workflows.

## Acceptance criteria
- Implement audited authorization/credential entry, account discovery, account selection, existing-account linking, setup, sync, and disconnect paths.
- Represent provider limitations and required investment-account subtype/currency choices explicitly.
- Keep tokens/credentials server-side and redact provider responses while retaining actionable stable errors.
- Handle duplicate accounts, expired credentials, empty brokerages, partial holdings, and interrupted setup.
- Reuse shared provider UI and state transitions without flattening provider-specific steps.

## Verification
- Rails behavior/docs and frontend integration tests cover each provider's happy path and key expiry/linking failures.

Project: [[08 V2 Providers]]
