---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_006"
title: "Implement API key and MCP settings"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["settings", "api-keys", "mcp"]
subtaskIds: []
dependencies: ["t_alt_set_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement user API-key lifecycle and MCP token/connection settings.

## Acceptance criteria
- List key metadata/scopes/last use, create a scoped key, reveal its secret exactly once, and revoke with confirmation.
- Show MCP configuration/status and revoke individual MCP tokens/connections without exposing stored secrets.
- Prevent secret values from logs, analytics, URL state, service-worker cache, SSR serialization, and later page revisits.
- Use role/capability guards and explain read versus read-write scope impact.
- Provide copy/download affordances with explicit user action and privacy-safe timeout/clear behavior.

## Verification
- Rails behavior/docs and browser tests cover one-time reveal, scopes, revoke, refresh, unauthorized roles, and leakage checks.

Project: [[06 Settings Onboarding and Admin]]
