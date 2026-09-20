---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_008
title: Refine the selected first slice
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
  - checkpoint
subtaskIds: []
dependencies:
  - "[[review-the-first-live-dashboard-slice|Review the first live dashboard slice]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:35.168Z
timeEstimate: 10
---

Apply the first review's product decisions while the implementation is still intentionally local and inexpensive to reshape.

## Ownership boundary
Own the prototype page and direct helpers. Delete rejected paths rather than preserving toggles, compatibility layers, or unused abstractions.

## Acceptance criteria
- Keep every reviewed behavior as-is: Configure modal editing, always-on drag
  handles, URL search state with deterministic fallback, confirmed delete/reset,
  transaction-style switcher, form-field title edit, table default with empty /
  error / truncation states.
- Add one chart presentation as the next experiment (time series first
  candidate): per-card presentation choice persisted on the report, table stays
  the default, failed chart mapping falls back to table without losing data.
- Preserve the proven core loop: edit SureQL, run against authorized real data, see results, arrange cards, and return after refresh.
- Name emerging file boundaries only where the revised code already has separate responsibilities; do not create interfaces for one implementation.
- Leave dashboard interaction, report presentation, and persistence code in identifiable file areas that the next three workers can own without shared-file edits.

## Verification
- Repeat the accepted browser walkthrough, demonstrate the chart presentation
  alongside table (including fallback to table), and verify discarded behavior
  and unused persisted fields are gone.
Project: [[01 Live UI and SureQL Loop]]
