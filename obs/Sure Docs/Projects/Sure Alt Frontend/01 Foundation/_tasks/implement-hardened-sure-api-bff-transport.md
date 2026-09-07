---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_005"
title: "Implement hardened Sure API BFF transport"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "backend", "security"]
subtaskIds: []
dependencies: ["t_alt_fnd_004", "t_alt_fnd_006", "t_alt_fnd_018"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Implement the TanStack Start server-side transport that is the browser's only path to the configured Sure API.

## Acceptance criteria
- Keep the Sure origin and credentials server-only; reject arbitrary upstream hosts, absolute-path escapes, and unsafe forwarded headers.
- Forward only allow-listed API paths, methods, content types, and required request metadata.
- Stream bounded uploads/downloads where needed and preserve useful status, rate-limit, and correlation headers.
- Apply request timeouts, cancellation, safe retry rules, body-size limits, and redacted structured errors.
- Define CSRF and same-origin enforcement for mutations and prevent shared caching of personalized financial data.

## Verification
- Tests cover SSRF attempts, header stripping, method/path validation, timeout, abort, binary response, and upstream error mapping.

Project: [[01 Foundation]]
