---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_002"
title: "Build manual account forms for all account types"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "frontend", "forms"]
subtaskIds: []
dependencies: ["t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build create/edit workflows for every manual account subtype using shared TanStack Form sections and subtype-specific schemas.

## Acceptance criteria
- Cover all account types named by the account API task, including property address/balance attributes where applicable.
- Render only contract-supported fields and map server validation to accessible fields and summaries.
- Support currency, subtype, ownership, report/default settings, and destructive delete/unlink with capability-based actions.
- Preserve user input through failures and block duplicate/offline writes.
- Provide shared responsive layouts without forcing unlike account types into one opaque form.

## Verification
- Component tests cover subtype schemas; Rails-backed Playwright covers create/edit/delete for every account family at desktop and mobile widths.

Project: [[04 Finance Planning and Reports]]
