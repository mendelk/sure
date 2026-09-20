---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_009
title: Implement brokerage provider connections
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - investments
  - api
subtaskIds: []
dependencies:
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
  - "[[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:49.154Z
timeEstimate: 40
---

API-enable and implement Questrade, IBKR, Trading 212, and Indexa Capital connection workflows.

## Acceptance criteria
- Implement audited authorization/credential entry, account discovery, account selection, existing-account linking, setup, sync, and disconnect paths.
- Represent provider limitations and required investment-account subtype/currency choices explicitly.
- Keep tokens/credentials server-side and redact provider responses while retaining actionable stable errors.
- Handle duplicate accounts, expired credentials, empty brokerages, partial holdings, and interrupted setup.
- Reuse shared provider UI and state transitions without flattening provider-specific steps.

## Verification
- Rails behavior/docs and frontend integration tests cover each provider's happy path and key expiry/linking failures.

Project: [[08 V2 Providers]]
