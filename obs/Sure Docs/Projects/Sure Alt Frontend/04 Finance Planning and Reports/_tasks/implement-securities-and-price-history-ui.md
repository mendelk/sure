---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_008"
title: "Implement securities and price history UI"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "securities", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fin_005", "t_alt_fnd_016"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build securities discovery/detail and price-history views from securities and security-prices APIs.

## Acceptance criteria
- Provide searchable/filterable security lists with ticker, exchange/MIC, type, currency, provider, and latest-price context.
- Show bounded price history and related holdings with accessible chart/table alternatives.
- Preserve exchange identity and distinguish stale, missing, provider-disabled, and manually sourced prices.
- Encode filters/ranges in typed URL state and apply themes, localization, privacy mode, and responsive layouts.
- Extend API fields/filters only when documented by the parity matrix.

## Verification
- Tests cover duplicate tickers across exchanges, missing history, large datasets, keyboard chart access, and account navigation.

Project: [[04 Finance Planning and Reports]]
