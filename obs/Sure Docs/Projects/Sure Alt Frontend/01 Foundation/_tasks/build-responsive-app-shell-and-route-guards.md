---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_010"
title: "Build responsive app shell and route guards"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "routing", "accessibility"]
subtaskIds: []
dependencies: ["t_alt_fnd_007", "t_alt_fnd_009"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
