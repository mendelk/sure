---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_004"
title: "Complete core transaction list contract"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["api", "transactions", "backend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004", "t_alt_fnd_018"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Make the transactions API sufficient for a minimal URL-driven, paginated browsing and editing experience.

## Acceptance criteria
- Audit existing filters/sorts and add only the documented parameters needed for dates, accounts, amount/type, category, status, and free-text search.
- Return stable pagination metadata and fields needed for normal, pending, and locked states.
- Define unambiguous amount/currency/date/time semantics and validation errors.
- Keep queries bounded, indexed, family-scoped, and compatible with API-key and OAuth authorization rules.

## Verification
- Minitest covers core filters/sorts and authorization edges; rswag documents without behavioral assertions; OpenAPI is regenerated.
- Defer specialized transfer, split, recurring, duplicate, tag, and merchant behavior to post-core tasks.

Project: [[02 Beta Dashboard and Transactions]]
