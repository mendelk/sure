---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_006
title: Refresh the local baseline from current finances
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - accounts
  - baseline
  - local-storage
subtaskIds: []
dependencies:
  - "[[explain-one-projected-year|Explain one projected year]]"
  - "[[ship-a-resettable-starter-plan|Ship a resettable starter plan]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:52.075Z
timeEstimate: 10
---

Allow the local plan to adopt newer Sure balances through an explicit, reviewable refresh instead of silently following every sync.

## Ownership boundary
Read authorized current finances and update only the local plan snapshot. Do not persist a planning copy on the server.

## Acceptance criteria
- Show when the saved baseline was captured and when current balances differ.
- Preview account additions, removals, and balance changes before applying them.
- Preserve scenario assumptions and user overrides when accepting a refreshed baseline.
- Handle closed, renamed, excluded, and newly created accounts without changing historical data.

## Verification
- Change fixture accounts, open the plan, inspect the preview, reject it once, accept it once, and confirm only the local baseline changes.

Project: [[01 Live Projection Loop]]
