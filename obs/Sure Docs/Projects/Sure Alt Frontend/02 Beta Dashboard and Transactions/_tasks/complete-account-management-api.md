---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_fin_001"
title: "Complete core manual account API"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "api", "backend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004", "t_alt_fnd_018"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Make the account API sufficient for the smallest useful manual-account workflow without pulling provider, sharing, or advanced settings into the core milestone.

## Acceptance criteria
- Add typed index/show/create/update/archive/delete operations for manual accounts.
- Cover common name, account type/subtype, opening/current balance, and currency fields with explicit schemas rather than arbitrary attributes.
- Return the minimum capabilities, manual/provider status, currency, balance summary, and validation metadata needed by account navigation and forms.
- Preserve family/role authorization and explicit destructive confirmation semantics.
- Defer provider unlinking, sharing/ownership changes, default/report settings, and advanced subtype metadata to `t_alt_fin_018`.

## Verification
- Minitest covers core actions and cross-family denial; docs-only rswag and regenerated OpenAPI cover every operation.

Project: [[02 Beta Dashboard and Transactions]]
