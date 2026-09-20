---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_002
title: Implement profile preferences and appearance
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - settings
  - frontend
  - api
subtaskIds: []
dependencies:
  - "[[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[add-localization-theme-and-privacy-foundations|Add localization theme and privacy foundations]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

API-enable and implement profile, family preferences, budget sharing, and appearance settings.

## Acceptance criteria
- Cover names, locale, timezone, country, currency, date format, month start, account ordering, default period, navigation preferences, and contract-approved fields.
- Synchronize light/dark/system and privacy-related presentation choices where the server owns them, with SSR-safe local fallback.
- Use capability/role-based forms, accessible validation, dirty-state navigation protection, and targeted cache updates.
- Never submit hidden/unknown settings or overwrite concurrent server values silently.
- Exclude hosted billing from this surface.

## Verification
- Rails behavior/docs and browser tests cover each settings group, validation, roles, concurrency, locale, theme, and mobile layout.

Project: [[06 Settings Onboarding and Admin]]
