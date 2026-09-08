---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_fin_002"
title: "Build core manual account forms"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "frontend", "forms"]
subtaskIds: []
dependencies: ["t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Build the minimum accessible create/edit/archive/delete workflows for manual accounts using shared TanStack Form sections and the generated core account contract.

## Acceptance criteria
- Cover the manual account types and fields exposed by the core account API without inventing unsupported subtype metadata.
- Render only contract-supported fields and map server validation to accessible fields and summaries.
- Support currency, type/subtype, opening/current balance, active state, and destructive delete with capability-based actions.
- Preserve user input through failures and block duplicate/offline writes.
- Provide shared responsive layouts without forcing unlike account types into one opaque form.
- Defer provider unlinking, sharing/ownership changes, report/default settings, and advanced metadata to `t_alt_fin_018`.

## Verification
- Component tests cover the core schemas; Rails-backed integration tests cover create/edit/archive/delete at desktop and mobile widths.

Project: [[02 Beta Dashboard and Transactions]]
