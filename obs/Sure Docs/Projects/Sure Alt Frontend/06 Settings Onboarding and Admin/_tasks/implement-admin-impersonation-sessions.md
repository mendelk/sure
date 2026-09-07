---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_016"
title: "Implement admin impersonation sessions"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["admin", "impersonation", "security"]
subtaskIds: []
dependencies: ["t_alt_set_010", "t_alt_set_011", "t_alt_fnd_006", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
