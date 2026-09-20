---
pm-task: true
projectId: "[[05 Automation and AI|05 Automation and AI]]"
parentId:
id: t_alt_auto_003
title: Implement insights workflows
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - insights
  - ai
  - frontend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
timeEstimate: 28
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
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
