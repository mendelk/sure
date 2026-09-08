---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_beta_010"
title: "Compose responsive dashboard"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "dashboard", "beta"]
subtaskIds: []
dependencies: ["t_alt_beta_002", "t_alt_beta_003", "t_alt_beta_005", "t_alt_beta_009"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Compose the post-core Sure-inspired dashboard from the account summary, trends, recent transactions, and sync status.

## Acceptance criteria
- Establish a deliberate visual hierarchy rather than copying the Rails grid screen-for-screen.
- Coordinate range/search state and query reuse so widgets do not issue duplicate requests.
- Support desktop and phone layouts, logical reading/focus order, privacy mode, themes, localization, and reduced motion.
- Provide useful empty-family onboarding guidance without implementing the full onboarding flow.
- Keep all core content available when charts fail and avoid horizontal overflow at supported widths.

## Verification
- Visual, accessibility, responsive, and real-API tests cover populated, empty, syncing, error, dark, and privacy states.

Project: [[04 Finance Planning and Reports]]
