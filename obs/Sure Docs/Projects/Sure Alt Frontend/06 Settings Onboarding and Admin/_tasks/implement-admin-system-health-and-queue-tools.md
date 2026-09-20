---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_013
title: Implement admin system health and queue tools
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - admin
  - operations
  - api
subtaskIds: []
dependencies:
  - "[[define-super-admin-api-and-authorization|Define super-admin API and authorization]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
  - "[[add-structured-logging-health-and-error-handling|Add structured logging health and error handling]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:55.377Z
timeEstimate: 40
---

Implement super-admin system health and required Sidekiq/background-queue parity without embedding the Sidekiq HTML application.

## Acceptance criteria
- Define allow-listed health, dependency, queue, job-summary, retry/dead/scheduled, and safe action resources required by the parity matrix.
- Redact job arguments and exception data that may contain financial/user/provider secrets.
- Build status dashboards and guarded cancel/retry/delete actions with explicit impact and audit metadata.
- Use bounded pagination/polling and degrade safely when Redis/queues are unavailable.
- Keep public liveness/readiness distinct from authenticated diagnostic detail.

## Verification
- Rails behavior/docs, redaction/authz tests, and browser scenarios cover healthy/degraded/down, queue actions, stale jobs, and normal-user denial.

Project: [[06 Settings Onboarding and Admin]]
