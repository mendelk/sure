---
pm-task: true
projectId: "[[02 Beta Dashboard and Transactions|02 Beta Dashboard and Transactions]]"
parentId:
id: t_alt_beta_010
title: Compose responsive core dashboard
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - dashboard
  - beta
subtaskIds: []
dependencies:
  - "[[implement-account-summary-navigation|Implement account summary navigation]]"
  - "[[build-net-worth-and-balance-trends|Build net worth and balance trends]]"
  - "[[build-transaction-browsing-route|Build transaction browsing route]]"
  - "[[implement-sync-trigger-and-progress-ui|Implement sync trigger and progress UI]]"
timeEstimate: 36
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Compose the first Sure-inspired dashboard from the account summary, trends, recent transactions, and sync status.

## Acceptance criteria
- Establish a deliberate visual hierarchy rather than copying the Rails grid screen-for-screen.
- Coordinate range/search state and query reuse so widgets do not issue duplicate requests.
- Support desktop and phone layouts, logical reading/focus order, privacy mode, themes, localization, and reduced motion.
- Provide useful empty-family onboarding guidance without implementing the full onboarding flow.
- Keep all core content available when charts fail and avoid horizontal overflow at supported widths.

## Verification
- Visual, accessibility, responsive, and real-API tests cover populated, empty, syncing, error, dark, and privacy states.

Project: [[02 Beta Dashboard and Transactions]]
