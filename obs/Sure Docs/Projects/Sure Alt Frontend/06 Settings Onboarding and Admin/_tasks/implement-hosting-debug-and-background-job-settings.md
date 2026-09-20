---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_008
title: Implement hosting debug and background job settings
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - settings
  - operations
  - api
subtaskIds: []
dependencies:
  - "[[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
  - "[[add-structured-logging-health-and-error-handling|Add structured logging health and error handling]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:47.573Z
timeEstimate: 40
---

API-enable and implement self-hosted configuration status, safe debug logs, background jobs, cache clearing, external-assistant disconnect, guides, and changelog/feedback/legal links.

## Acceptance criteria
- Return allow-listed redacted operational data and stable job/debug categories; never expose environment secrets or arbitrary files.
- Implement permitted cancel/clear/disconnect actions with role guards, idempotency, confirmation, and auditability.
- Build filterable/paginated responsive debug/job views with correlation IDs and safe support export if required by parity.
- Represent configured external legal/feedback URLs safely and prevent open redirects.
- Exclude hosted payment/subscription UI.

## Verification
- Rails behavior/docs and browser tests cover redaction, roles, pagination, actions, empty/unavailable states, and malicious URLs.

Project: [[06 Settings Onboarding and Admin]]
