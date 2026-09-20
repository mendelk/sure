---
pm-task: true
projectId: "[[01 Foundation|01 Foundation]]"
parentId:
id: t_alt_fnd_014
title: Add structured logging health and error handling
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - observability
  - operations
  - privacy
subtaskIds: []
dependencies:
  - "[[implement-hardened-sure-api-bff-transport|Implement hardened Sure API BFF transport]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
timeEstimate: 20
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Add production diagnostics that help self-hosters without logging financial data or credentials.

## Acceptance criteria
- Emit structured server logs with request IDs, route templates, status, duration, upstream timing, and sanitized error codes.
- Redact cookies, authorization, tokens, API keys, query values, request bodies, response bodies, and financial identifiers by default.
- Add liveness and readiness endpoints that distinguish frontend health, configuration validity, and optional Rails reachability.
- Provide user-facing error boundaries with correlation IDs and safe retry actions.
- Document log levels, health semantics, and troubleshooting steps; add no product analytics.

## Verification
- Tests prove redaction and health transitions; malformed upstream responses never leak payloads to logs or users.

Project: [[01 Foundation]]
