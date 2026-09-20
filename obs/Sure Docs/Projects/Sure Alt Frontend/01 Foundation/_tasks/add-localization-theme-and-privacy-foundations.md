---
pm-task: true
projectId: "[[01 Foundation|01 Foundation]]"
parentId:
id: t_alt_fnd_011
title: Add localization theme and privacy foundations
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - i18n
  - privacy
subtaskIds: []
dependencies:
  - "[[generate-stylex-themes-from-sure-design-tokens|Generate StyleX themes from Sure design tokens]]"
  - "[[build-accessible-ui-primitives-and-storybook|Build accessible UI primitives and Storybook]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
timeEstimate: 28
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Create cross-cutting presentation foundations for English-first localization, light/dark/system themes, and sensitive-value masking.

## Acceptance criteria
- Route all user-facing strings through message keys with locale-aware currency, number, date, and timezone formatting.
- Prevent hydration mismatch while selecting system or persisted light/dark theme.
- Add a global privacy control that masks balances, chart values, tooltips, accessible names, copied text, and previews without changing source data.
- Persist only non-sensitive presentation preferences and define how later user-settings APIs can synchronize them.
- Add pseudolocale/long-text fixtures and tests for theme and privacy behavior.

## Verification
- SSR, hydration, theme changes, and privacy toggles pass automated tests without exposing masked values in the rendered accessibility tree.

Project: [[01 Foundation]]
