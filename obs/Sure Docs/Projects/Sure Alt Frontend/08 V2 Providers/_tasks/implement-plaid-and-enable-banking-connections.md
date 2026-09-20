---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_005
title: Implement Plaid and Enable Banking connections
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - frontend
  - api
subtaskIds: []
dependencies:
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
  - "[[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:41.829Z
timeEstimate: 40
---

API-enable and implement complete Plaid and Enable Banking connection, callback, account-linking, reauthorization, sync, and disconnect flows.

## Acceptance criteria
- Follow each provider's audited state machine and reusable connection contract without Rails page fallback.
- Preserve OAuth/link tokens server-side where possible and validate callback state, expiry, replay, and allowed return paths.
- Support selecting imported accounts and linking to existing compatible Sure accounts.
- Surface cancellation, partial consent, expired authorization, duplicate connection, provider outage, and recoverable setup states.
- Add role-aware responsive UI and provider-safe diagnostics.

## Verification
- Provider service/controller Minitest, docs-only rswag/OpenAPI, frontend component tests, and callback/account-linking Playwright scenarios pass.

Project: [[08 V2 Providers]]
