---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_003"
title: "Implement password email and session management"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["security", "settings", "auth"]
subtaskIds: []
dependencies: ["t_alt_set_001", "t_alt_fnd_006", "t_alt_fnd_007", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement password change, email-confirmation status/resend, active session listing, session revocation, and current-session updates.

## Acceptance criteria
- Require recent authentication/current password where appropriate and apply the backend password policy.
- Return session metadata without token values and distinguish the current session safely.
- Revoke selected/all-other sessions idempotently and terminate the BFF session when its Rails credential is invalidated.
- Add accessible forms/confirmations and explicit success/failure states without disclosing account existence.
- Update identity/capability caches after email or security changes.

## Verification
- Rails behavior/docs and browser tests cover password policy, resend throttling, session revoke/current-session behavior, expiry, and CSRF.

Project: [[06 Settings Onboarding and Admin]]
