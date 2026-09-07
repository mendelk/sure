---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_012"
title: "Complete budget write API"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["budgets", "api", "backend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004", "t_alt_fnd_018"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Extend read-only budget APIs for allocation editing, category movement, copy-previous, and family budget-sharing preferences.

## Acceptance criteria
- Define month identifiers, owner/share scope, income/allocation/actual/available totals, category groups, and edit capabilities.
- Add decimal-safe idempotent operations for allocations, moving categories, copying prior month, and budget sharing.
- Return conflict/validation details for oversubscription, stale totals, inaccessible owners, and invalid categories.
- Keep calculations authoritative on Rails and responses sufficient for targeted query updates.
- Preserve family role and account-sharing rules.

## Verification
- Minitest covers calculations/concurrency/roles; docs-only rswag and regenerated OpenAPI cover all operations.

Project: [[04 Finance Planning and Reports]]
