---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_006
title: Implement API key and MCP settings
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - settings
  - api-keys
  - mcp
subtaskIds: []
dependencies:
  - "[[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:43.623Z
timeEstimate: 36
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
