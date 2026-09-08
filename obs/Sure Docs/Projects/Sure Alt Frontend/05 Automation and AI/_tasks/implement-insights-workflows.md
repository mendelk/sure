---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_003"
title: "Implement insights workflows"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["insights", "ai", "frontend"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Complete insight list, refresh, acknowledge, and unacknowledge behavior through typed APIs and an accessible UI.

## Acceptance criteria
- Extend the insights API for missing refresh/acknowledgement actions and stable status/source metadata.
- Build grouped/filterable insight cards with generated/fallback attribution, timestamps, related navigation, and safe markdown/text rendering.
- Poll bounded refresh work only while active and distinguish unavailable, disabled, stale, empty, failed, and rate-limited states.
- Apply localization, privacy masking, responsive layouts, and role/capability guards.
- Do not log or add analytics for insight content.

## Verification
- Minitest/docs/OpenAPI and browser tests cover refresh, fallback, acknowledge/unacknowledge, disabled AI, and failures.

Project: [[05 Automation and AI]]
