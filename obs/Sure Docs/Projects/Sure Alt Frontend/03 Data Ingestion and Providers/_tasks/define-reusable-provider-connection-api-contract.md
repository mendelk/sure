---
pm-task: true
projectId: "[[03 Data Ingestion and Providers|03 Data Ingestion and Providers]]"
parentId:
id: t_alt_ing_004
title: Define reusable provider connection API contract
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - api
  - security
subtaskIds: []
dependencies:
  - "[[inventory-provider-connection-state-machines|Inventory provider connection state machines]]"
  - "[[implement-hardened-sure-api-bff-transport|Implement hardened Sure API BFF transport]]"
  - "[[threat-model-browser-authentication-and-bff|Threat-model browser authentication and BFF]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:30.677Z
timeEstimate: 40
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
