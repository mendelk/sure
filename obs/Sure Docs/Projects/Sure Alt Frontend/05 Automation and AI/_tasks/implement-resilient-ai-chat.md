---
pm-task: true
projectId: "[[05 Automation and AI|05 Automation and AI]]"
parentId:
id: t_alt_auto_004
title: Implement resilient AI chat
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - ai
  - chat
  - frontend
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
  - "[[add-structured-logging-health-and-error-handling|Add structured logging health and error handling]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:37.980Z
timeEstimate: 40
---

Implement chat list/detail/create/rename/delete, message submission, retry, tool-call presentation, timeout recovery, and responsive conversation UI.

## Acceptance criteria
- Reconcile current chat/message API behavior with Rails timeout reporting/retry and add typed operations or streaming/status support where needed.
- Render user/assistant content safely, distinguish tool calls/results, and never execute model-provided markup or links implicitly.
- Prevent duplicate messages, recover interrupted responses, and expose timeout/retry/cancel states without indefinite polling.
- Preserve scroll/focus/accessibility behavior, mobile input ergonomics, privacy mode, and reduced motion.
- Redact message/tool content from server logs, traces, screenshots, and error reports.

## Verification
- Rails behavior/docs and Playwright cover complete turns, tool calls, timeout, retry, refresh recovery, deletion, and disabled/unavailable AI.

Project: [[05 Automation and AI]]
