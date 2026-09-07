---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_006"
title: "Add web push notifications"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["pwa", "notifications", "api"]
subtaskIds: []
dependencies: ["t_alt_fnd_010", "t_alt_fnd_012", "t_alt_fnd_013"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Add opt-in web push using the existing push-subscription API and the alternate frontend service worker.

## Acceptance criteria
- Request permission only after user intent and explain supported notification types/privacy before subscribing.
- Create/replace/remove subscriptions idempotently and clean up invalid/expired endpoints.
- Route notification clicks to authenticated safe relative routes with no sensitive values in payload/title/body.
- Handle denied, unsupported, revoked, multiple-device, offline, logout, and service-worker update states.
- Add settings controls and self-hosting configuration documentation.

## Verification
- Tests cover subscription lifecycle, payload sanitization, click routing, logout cleanup, and unsupported/denied UX.

Project: [[05 Automation and AI]]
