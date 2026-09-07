---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_014"
title: "Implement guarded reset and account deletion"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["settings", "destructive", "security"]
subtaskIds: []
dependencies: ["t_alt_set_001", "t_alt_fnd_006", "t_alt_fnd_012"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Complete family data reset/status, reset-with-sample-data where supported, and user account deletion with strong safeguards.

## Acceptance criteria
- Reconcile existing `/api/v1/users/reset`, reset status, and `users/me` delete behavior with Rails user reset variants.
- Require recent authentication, typed confirmation, server capability, and role/last-admin/family-ownership checks.
- Make long-running reset state resumable and disable conflicting actions until terminal.
- Revoke all sessions/tokens and clear BFF/query/service-worker private state after deletion or identity-invalidating reset.
- Explain irreversible scope without exposing deleted data in logs or artifacts.

## Verification
- Rails and browser tests cover reset progress/success/failure, sample option, deletion, cancellation limitations, role denial, and post-action token invalidation.

Project: [[06 Settings Onboarding and Admin]]
