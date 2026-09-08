---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_005"
title: "Implement holdings management parity"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "holdings", "api"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Complete holding creation/edit/delete, cost-basis unlock, security remap/reset, price sync, and portfolio browsing through the API.

## Acceptance criteria
- Extend the current read-only holding contract with explicit capability-guarded mutations and validation.
- Build account/security filters, holding details, value/cost/gain presentation, and responsive forms/actions.
- Preserve decimal/currency precision and distinguish provider-managed versus editable holdings.
- Confirm destructive/remap actions and invalidate account, security, portfolio, and dashboard queries correctly.
- Handle stale prices, missing securities, locked cost basis, partial positions, and privacy mode.

## Verification
- Rails behavior/docs and Playwright tests cover manual/provider holdings, remap/reset, unlock, sync, and deletion.

Project: [[04 Finance Planning and Reports]]
