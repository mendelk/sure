---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_007"
title: "Implement transaction category tag and merchant editing"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "transactions", "classification"]
subtaskIds: []
dependencies: ["t_alt_beta_005"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Add transaction-level category, tag, and merchant editing using existing typed collection and mutation APIs.

## Acceptance criteria
- Provide accessible searchable selectors with keyboard/touch behavior, clear actions, loading states, and long-list performance.
- Support creating a permitted category, tag, or merchant inline only where the current API contract allows it.
- Preserve category colors/icons and tag/merchant identity without encoding raw visual values in feature components.
- Invalidate transaction, dashboard, budget, and metadata queries narrowly after changes.
- Handle deleted options, stale selections, validation errors, and concurrent edits safely.

## Verification
- Component and Rails-backed Playwright tests cover selection, clearing, inline creation, keyboard use, mobile presentation, and rollback.

Project: [[02 Beta Dashboard and Transactions]]
