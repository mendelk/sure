---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_009"
title: "Implement transfer management parity"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["transfers", "api", "frontend"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Extend read-only transfer APIs and implement create/show/update/delete, match, reject/review, tags, and recurring actions.

## Acceptance criteria
- Model transfer sides, accounts, amounts/currencies, dates, matching confidence/state, rejection, and allowed actions precisely.
- Add role/family-scoped mutation endpoints with idempotent matching and clear conflict validation.
- Build responsive list/detail/forms and transaction match/rejected-transfer review workflows.
- Preserve source transactions and require explicit confirmation where unlinking/deletion changes classification.
- Refresh transactions, account activity, reports, and recurring data after mutations.

## Verification
- Minitest/docs/OpenAPI and browser tests cover manual transfer, matching, rejection, edit, tags, recurring mark, and delete.

Project: [[04 Finance Planning and Reports]]
