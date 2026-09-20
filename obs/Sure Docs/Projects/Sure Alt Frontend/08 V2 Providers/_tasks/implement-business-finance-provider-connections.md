---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_010
title: Implement business finance provider connections
type: task
status: todo
priority: high
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
updatedAt: 2026-09-20T17:56:50.783Z
timeEstimate: 40
---

API-enable and implement Mercury, Wise, and Brex connection workflows.

## Acceptance criteria
- Cover preload/profile/account selection, new/existing account links, nested Brex account-flow/setup behavior, sync, reconnect, and disconnect.
- Keep credentials server-side and use provider-specific validation and stable redacted error codes.
- Preserve profile, account, subtype, currency, and ownership distinctions required by each provider.
- Handle empty profiles, inaccessible accounts, duplicates, partial setup, expired access, and provider outages.
- Reuse shared provider UI while exposing the audited next actions precisely.

## Verification
- Contract and Rails-backed browser tests cover every provider's complete setup and recovery path.

Project: [[08 V2 Providers]]
