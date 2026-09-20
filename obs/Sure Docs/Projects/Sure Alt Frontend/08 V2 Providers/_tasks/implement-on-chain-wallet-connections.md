---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_ing_013
title: Implement on-chain wallet connections
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - providers
  - crypto
  - wallets
subtaskIds: []
dependencies:
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
  - "[[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:55.198Z
timeEstimate: 40
---

API-enable and implement self-custody wallet preview, linking, token review, pricing enablement, sync, and selective/full disconnect.

## Acceptance criteria
- Validate supported network/address input and preview wallet ownership-independent public data safely.
- Let users review imported assets/tokens and link or create compatible Sure accounts before completion.
- Support enabling required crypto prices and make pricing limitations explicit.
- Implement token updates, disconnect-wallet, disconnect-asset, and recoverable sync states with confirmations.
- Apply privacy masking and never imply Sure has custody or signing access.

## Verification
- Contract and browser tests cover supported/invalid addresses, token review, pricing, sync, selective disconnect, and full disconnect.

Project: [[08 V2 Providers]]
