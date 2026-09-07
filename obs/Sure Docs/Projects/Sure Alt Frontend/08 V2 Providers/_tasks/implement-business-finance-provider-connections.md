---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_010"
title: "Implement business finance provider connections"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement Mercury, Wise, and Brex connection workflows.

## Acceptance criteria
- Cover preload/profile/account selection, new/existing account links, nested Brex account-flow/setup behavior, sync, reconnect, and disconnect.
- Keep credentials server-side and use provider-specific validation and stable redacted error codes.
- Preserve profile, account, subtype, currency, and ownership distinctions required by each provider.
- Handle empty profiles, inaccessible accounts, duplicates, partial setup, expired access, and provider outages.
- Reuse shared provider UI while exposing the audited next actions precisely.

## Verification
- Contract and Rails-backed browser tests cover every provider's complete setup and recovery path.

Project: [[08 V2 Providers]]
