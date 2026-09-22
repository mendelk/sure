---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_002
title: Make core projection assumptions editable
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - frontend
  - assumptions
  - projection
subtaskIds: []
dependencies:
  - "[[build-the-first-live-lifetime-projection|Build the first live lifetime projection]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T18:06:13.845Z
timeEstimate: 8
---

Let a user change the handful of assumptions that drive the first projection and immediately understand the effect.

## Ownership boundary
Extend the live page only. Keep form state and calculation input feature-local; do not generalize fields into a schema system.

## Acceptance criteria
- Edit horizon, annual income, annual spending, inflation, and investment return with labelled inputs.
- Apply changes explicitly and show validation beside the affected input.
- Recalculate the same table and chart without a page reload.
- Distinguish nominal inputs from inflation-adjusted results in plain language.

## Verification
- Change each assumption on the live route and confirm the expected direction of the projection and visible validation for invalid values.

Project: [[01 Live Projection Loop]]
