---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_001"
title: "Complete account management API"
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
updatedAt: "2026-09-07T01:09:35.000Z"
---

Extend the current account index/show/create API to cover normal account management and every manual account subtype.

## Acceptance criteria
- Add typed update/delete, active toggle, report exclusion, default account, provider unlink, and sharing operations required by the parity matrix.
- Model subtype-specific fields for depository, investment, property, vehicle, credit card, loan, crypto, other asset, and other liability without unsafe arbitrary attributes.
- Return capabilities/allowed actions, provider/manual status, ownership/sharing, currency, balance summary, and validation metadata.
- Preserve family/role authorization and explicit destructive/provider-unlink confirmation semantics.

## Verification
- Minitest covers each subtype/action and cross-family denial; docs-only rswag and regenerated OpenAPI cover every operation.

Project: [[04 Finance Planning and Reports]]
