---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_005"
title: "Build transaction browsing route"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "transactions", "tanstack"]
subtaskIds: []
dependencies: ["t_alt_fnd_010", "t_alt_fnd_012", "t_alt_beta_004"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build responsive transaction list and detail routes with TanStack Query, Router, Table, and Virtual where data size warrants it.

## Acceptance criteria
- Encode filters, sorting, pagination, and selected transaction in validated URL search state.
- Support accessible desktop table and mobile list presentations with consistent semantics and actions.
- Prefetch detail navigation, retain prior data during page changes, cancel obsolete requests, and invalidate narrowly.
- Expose pending, transfer, split, recurring, duplicate, and locked states without relying only on color.
- Apply localization, privacy masking, deep-link, empty, loading, rate-limit, and recoverable-error behavior.

## Verification
- Unit and real-API Playwright tests cover filtering, pagination, deep links, mobile navigation, keyboard use, and stale/error states.

Project: [[02 Beta Dashboard and Transactions]]
