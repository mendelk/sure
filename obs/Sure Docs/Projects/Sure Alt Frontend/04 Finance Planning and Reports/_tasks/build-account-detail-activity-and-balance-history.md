---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_003"
title: "Build account detail activity and balance history"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "frontend", "charts"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_016"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Turn the beta account placeholder into complete account overview, balance history, and activity routes.

## Acceptance criteria
- Show subtype-aware metadata, current balance, historical trend, provider/manual status, sync state, and allowed management actions.
- Integrate filtered transaction/trade/valuation/holding activity without duplicating list implementations.
- Add or extend bounded sparkline/history contracts only where current balance endpoints are insufficient.
- Support URL-driven ranges/tabs, privacy mode, themes, localization, keyboard chart access, and responsive layouts.
- Handle disabled, shared, disconnected, stale, empty, and deleted accounts.

## Verification
- Real-API Playwright covers representative asset/liability/manual/provider accounts and deep-linked activity state.

Project: [[04 Finance Planning and Reports]]
