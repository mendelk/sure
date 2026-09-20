---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_016
title: Implement admin impersonation sessions
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - admin
  - impersonation
  - security
subtaskIds: []
dependencies:
  - "[[define-super-admin-api-and-authorization|Define super-admin API and authorization]]"
  - "[[implement-admin-user-family-and-invitation-management|Implement admin user family and invitation management]]"
  - "[[threat-model-browser-authentication-and-bff|Threat-model browser authentication and BFF]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

API-enable and implement impersonation request, approval, rejection, join, leave, and completion with unmistakable session state.

## Acceptance criteria
- Preserve the existing approval model and restrict request/review/join actions to explicitly authorized actors.
- Bind approvals to short-lived single-use sessions and prevent self-approval, replay, privilege escalation, or cross-family access.
- Display a persistent accessible impersonation banner with target identity, scope, expiry, and leave action on every route.
- Suspend or explicitly block destructive/security/admin actions while impersonating according to the backend policy.
- Audit every transition without recording financial contents or credentials; invalidate BFF capability/query state on join and leave.

## Verification
- Security, Minitest/docs/OpenAPI, and multi-session Playwright tests cover request/approve/reject/join/leave/complete, expiry, replay, and denial.

Project: [[06 Settings Onboarding and Admin]]
