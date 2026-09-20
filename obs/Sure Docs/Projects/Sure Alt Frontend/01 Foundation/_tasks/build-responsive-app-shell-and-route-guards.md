---
pm-task: true
projectId: "[[01 Foundation|01 Foundation]]"
parentId:
id: t_alt_fnd_010
title: Build responsive app shell and route guards
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - routing
  - accessibility
subtaskIds: []
dependencies:
  - "[[implement-secure-login-refresh-and-logout-sessions|Implement secure login refresh and logout sessions]]"
  - "[[build-accessible-ui-primitives-and-storybook|Build accessible UI primitives and Storybook]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:39.145Z
timeEstimate: 36
---

Build the shared authenticated route shell for desktop and mobile layouts.

## Acceptance criteria
- Implement type-safe public, authenticated, settings, and admin route groups with SSR-safe guards.
- Provide adaptive sidebar/bottom navigation, skip links, landmarks, breadcrumbs, page titles, and focus management.
- Derive visible navigation from server-validated capabilities rather than client-only role assumptions.
- Add route-level pending, not-found, unauthorized, and unexpected-error states.
- Ensure deep links and browser back/forward behavior preserve typed search/filter state.

## Verification
- Keyboard-only and Playwright tests cover login redirects, deep links, role guards, responsive navigation, and focus restoration.

Project: [[01 Foundation]]
