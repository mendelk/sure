---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_004"
title: "Define reusable provider connection API contract"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "api", "security"]
subtaskIds: []
dependencies: ["t_alt_ing_001", "t_alt_fnd_005", "t_alt_fnd_006"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Define provider connection resources and transition responses that support diverse workflows without exposing Rails HTML or arbitrary dispatch.

## Acceptance criteria
- Model connection attempt IDs, allowed next actions, expiring state, redirects, challenges, account candidates, linking, completion, cancellation, and terminal errors.
- Bind attempts to user/family/provider/session, enforce expiry and replay protection, and allow only server-declared transitions.
- Define safe callback handoff through the BFF for third-party OAuth while preserving state/PKCE protections.
- Specify idempotency, polling, upload/body limits, error codes, and credential redaction.
- Add a reference implementation and contract tests before individual providers adopt it.

## Verification
- Threat review passes; Minitest and docs-only rswag cover the state machine; OpenAPI is regenerated and generated TypeScript compiles.

Project: [[03 Data Ingestion and Providers]]
