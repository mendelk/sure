---
pm-task: true
projectId: "[[01 Live Projection Loop|01 Live Projection Loop]]"
parentId:
id: t_lfp_live_001
title: Build the first live lifetime projection
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - frontend
  - projection
  - walking-slice
subtaskIds: []
dependencies: []
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T18:56:05.000Z
timeEstimate: 12
---

Make the first implementation useful: an authenticated planning route turns the family’s current balances and simple defaults into a visible year-by-year net-worth projection.

## Ownership boundary
Own the smallest route, page, and feature-local calculation needed for this slice. Do not create planning models, generic simulation frameworks, persistence APIs, or migrations.

## Acceptance criteria
- Show current family net worth as the starting point without copying or mutating account records.
- Project a fixed horizon from explicit default income, spending, inflation, and return assumptions.
- Render a semantic yearly table and simple chart with loading, empty, and calculation-error states.
- Label the output as an estimate and keep every assumption visible from the page.

## Verification
- Open the actual planning route with fixture-backed accounts and visibly confirm the baseline, yearly output, empty state, and an invalid-input error.

Project: [[01 Live Projection Loop]]
