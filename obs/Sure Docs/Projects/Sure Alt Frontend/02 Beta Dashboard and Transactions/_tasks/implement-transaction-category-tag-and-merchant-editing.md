---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_007"
title: "Implement transaction category editing"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "transactions", "categories"]
subtaskIds: []
dependencies: ["t_alt_beta_006"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Add transaction-level category assignment using the typed collection and mutation APIs. Defer tag and merchant assignment/management to the advanced finance epic.

## Acceptance criteria
- Provide an accessible searchable category selector with keyboard/touch behavior, a clear action, loading states, and long-list performance.
- Support creating a category inline only where the current API contract allows it.
- Preserve category identity without encoding raw visual values in feature components.
- Invalidate transaction and category queries narrowly after changes.
- Handle deleted options, stale selections, validation errors, and concurrent edits safely.

## Verification
- Component and Rails-backed integration tests cover selection, clearing, inline creation, keyboard use, mobile presentation, and rollback.

Project: [[02 Beta Dashboard and Transactions]]
