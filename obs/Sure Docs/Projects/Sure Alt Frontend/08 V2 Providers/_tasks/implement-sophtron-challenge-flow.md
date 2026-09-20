---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_012
title: Implement Sophtron challenge flow
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - mfa
  - api
subtaskIds: []
dependencies:
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
  - "[[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:53.801Z
timeEstimate: 40
---

API-enable and implement Sophtron institution connection, manual-sync configuration, MFA challenge, status polling, account setup, sync, and disconnect.

## Acceptance criteria
- Model institution selection, credential submission, challenge prompts, challenge response, connection status, timeout, retry, and cancellation explicitly.
- Bind challenge attempts to the initiating session and prevent replay or cross-user access.
- Never persist or log credentials/challenge answers in the browser or server diagnostics.
- Support account selection/linking and provider-specific subtype setup after authentication.
- Provide accessible status announcements without excessive polling/live-region noise.

## Verification
- Tests cover challenge success, wrong/expired answer, timeout, restart, manual sync toggle, account setup, and disconnect.

Project: [[08 V2 Providers]]
