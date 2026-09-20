---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_008
title: Refine the selected first projection
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - refinement
  - projection
  - checkpoint
subtaskIds: []
dependencies:
  - "[[review-the-first-live-projection-slice|Review the first live projection slice]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:55.093Z
timeEstimate: 8
---

Apply the first review so later experiments build on one coherent, useful baseline.

## Ownership boundary
Change only behavior selected at review and delete rejected experiments. Do not extract reusable architecture.

## Acceptance criteria
- Implement every accepted change from the review.
- Remove rejected controls, fields, calculations, and dead local data.
- Keep the route usable with current finances and with a starter-only empty family.
- Update the local payload only as needed for the accepted behavior and recover older experimental payloads by resetting safely.

## Verification
- Repeat the accepted first-slice browser walkthrough and confirm no rejected behavior or unused state remains.

Project: [[01 Live Projection Loop]]
