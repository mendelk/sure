---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_002"
title: "Add provider management API"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "api", "backend"]
subtaskIds: []
dependencies: ["t_alt_ing_001"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Extend provider APIs beyond the current read-only connection listing so the alternate frontend can manage configured providers.

## Acceptance criteria
- Return enabled/available providers, configuration readiness, connection summaries, capabilities, last sync, health, and safe support metadata.
- Add role-scoped operations for global/provider sync and supported connection management actions.
- Never return stored credentials, tokens, raw provider payloads, or sensitive debug values.
- Use stable provider keys/error codes and explicit unavailable/misconfigured states.
- Keep provider-specific connection transitions behind the reusable contract task rather than one generic unsafe payload.

## Verification
- Add Minitest behavior/authorization coverage, docs-only rswag specs using `X-Api-Key`, and regenerated OpenAPI.

Project: [[03 Data Ingestion and Providers]]
