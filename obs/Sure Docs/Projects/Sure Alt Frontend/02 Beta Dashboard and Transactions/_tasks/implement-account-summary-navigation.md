---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_002"
title: "Implement account summary navigation"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "accounts", "beta"]
subtaskIds: []
dependencies: ["t_alt_fin_001", "t_alt_fnd_004", "t_alt_fnd_010", "t_alt_fnd_012", "t_alt_fnd_018"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Add responsive account-group summaries that give the beta a useful navigation path into existing account data.

## Acceptance criteria
- Show asset/liability groups, account names/types, current balances, currency context, disabled state, and totals from typed queries.
- Use semantic links and compact mobile presentation without hiding account status from assistive technology.
- Apply privacy masking to every amount and accessible label.
- Handle empty, partial, stale, loading, unavailable, and mixed-currency data explicitly.
- Link to a stable account-detail route placeholder that later account parity work can extend.

## Verification
- Component and Playwright tests cover responsive navigation, privacy mode, and error/empty states.

Project: [[02 Beta Dashboard and Transactions]]
