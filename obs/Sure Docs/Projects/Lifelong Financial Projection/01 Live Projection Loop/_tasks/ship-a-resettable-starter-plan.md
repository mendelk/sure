---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_005
title: Ship a resettable starter plan
type: task
status: done
priority: high
start: ""
due: ""
progress: 100
assignees: []
tags:
  - seeds
  - local-storage
  - onboarding
subtaskIds: []
dependencies:
  - "[[remember-one-plan-in-local-storage|Remember one plan in local storage]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:50.440Z
timeEstimate: 6
---

Give first-time users a useful starting point and an explicit way back to it while all data remains local.

## Ownership boundary
Own the feature-local starter payload and reset action. Do not add seed tables, background jobs, or server writes.

## Acceptance criteria
- Create the starter only when no user plan exists.
- Never overwrite a locally edited plan during an application update.
- Require clear confirmation before resetting and explain what local data will be replaced.
- Keep the starter assumptions readable and directly editable on the route.

## Verification
- Exercise first visit, edit, reload, application refresh, cancel reset, and confirmed reset in the browser.

Project: [[01 Live Projection Loop]]
