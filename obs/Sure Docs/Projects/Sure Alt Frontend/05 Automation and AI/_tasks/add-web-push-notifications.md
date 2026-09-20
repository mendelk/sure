---
pm-task: true
projectId: "[[05 Automation and AI|05 Automation and AI]]"
parentId:
id: t_alt_auto_006
title: Add web push notifications
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - pwa
  - notifications
  - api
subtaskIds: []
dependencies:
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
  - "[[add-installable-resilient-pwa-foundation|Add installable resilient PWA foundation]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:41.093Z
timeEstimate: 32
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
