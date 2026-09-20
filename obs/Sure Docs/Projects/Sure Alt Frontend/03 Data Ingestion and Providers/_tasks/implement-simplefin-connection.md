---
pm-task: true
projectId: "[[03 Data Ingestion and Providers|03 Data Ingestion and Providers]]"
parentId:
id: t_alt_ing_007
title: Implement SimpleFIN connection
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
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:32.160Z
timeEstimate: 40
---

API-enable and implement the SimpleFIN setup-token flow through account selection, linking, sync, reconnect, and disconnect.

## Acceptance criteria
- Validate and redeem setup tokens through one-time submission; never return or redisplay saved credentials.
- Cover account preview/selection, new or existing account links, setup review, and disabled/replacement states.
- Preserve SimpleFIN pending and FX metadata semantics already documented by the backend.
- Use the shared provider UI while retaining SimpleFIN-specific instructions and stable error codes.
- Clear sensitive form state after submit, navigation, expiry, and failure.

## Verification
- Rails behavior/docs and frontend tests cover valid/invalid setup tokens, account mapping, sync, pending/FX metadata, reconnect, and disconnect.

Project: [[03 Data Ingestion and Providers]]
