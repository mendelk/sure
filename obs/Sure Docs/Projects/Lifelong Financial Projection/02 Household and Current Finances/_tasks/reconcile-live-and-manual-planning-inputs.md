---
pm-task: true
projectId: "p_lfp_02"
parentId: null
id: "t_lfp_105"
title: "Reconcile live and manual planning inputs"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["baseline", "sync", "imports"]
subtaskIds: []
dependencies: ["t_lfp_104"]
timeEstimate: 20
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Let households maintain accurate planning facts whether accounts are synced, manually valued, imported, or intentionally unlinked.

## Acceptance criteria
- Updating current finances offers a review of account, balance, basis, ownership, and profile changes since the prior snapshot.
- Manual values can be dated, corrected, and superseded without erasing historical progress.
- Provider data never overwrites planning-only assumptions such as future growth or liquidation settings.
- Unlinked or closed accounts remain explainable in old plans and can be mapped to replacements.
- Conflicts from simultaneous updates are detected and resolved without silently combining incompatible revisions.

## Verification
- Exercise provider sync, CSV import, manual valuation, account closure, replacement mapping, and concurrent household edits.

Project: [[02 Household and Current Finances]]
