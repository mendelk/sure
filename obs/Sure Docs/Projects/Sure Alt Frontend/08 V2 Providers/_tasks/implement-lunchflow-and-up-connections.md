---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_v2p_001"
title: "Implement Lunchflow and Up connections"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "frontend", "api", "v2"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement credential/token flows for Lunchflow and Up through account selection, linking, sync, reconnect, and disconnect.

## Acceptance criteria
- Use provider-specific validated credential fields and one-time submission; never return or redisplay saved secrets.
- Cover account preview/selection, new or existing account links, setup review, and disabled/replacement states where supported.
- Preserve Lunchflow pending transaction semantics already documented by the backend.
- Reuse shared provider UI while retaining provider-specific instructions and stable error codes.
- Clear sensitive form state after submit, navigation, expiry, and failure.

## Verification
- Rails behavior/docs and frontend tests cover valid/invalid credentials, account mapping, sync, pending metadata, reconnect, and disconnect for both providers.

Project: [[08 V2 Providers]]
