---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_011
title: Implement Akahu and Redbark connections
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - api
  - frontend
subtaskIds: []
dependencies:
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
  - "[[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:52.223Z
timeEstimate: 36
---

API-enable and implement Akahu and Redbark connection, account-selection/linking, setup, sync, and disconnect flows.

## Acceptance criteria
- Follow the audited provider transitions and callback/credential security controls.
- Preserve provider-specific institution/account metadata and account compatibility validation.
- Handle cancellation, expiry, no-account, duplicate, partial setup, and recoverable provider errors.
- Keep all credentials and raw provider payloads out of browser persistence and diagnostics.
- Provide accessible responsive steps using the shared provider shell.

## Verification
- Minitest, docs-only rswag/OpenAPI, component, and Rails-backed Playwright coverage passes for both providers.

Project: [[08 V2 Providers]]
