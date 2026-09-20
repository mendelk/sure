---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_003
title: Implement password email and session management
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - security
  - settings
  - auth
subtaskIds: []
dependencies:
  - "[[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]]"
  - "[[threat-model-browser-authentication-and-bff|Threat-model browser authentication and BFF]]"
  - "[[implement-secure-login-refresh-and-logout-sessions|Implement secure login refresh and logout sessions]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:38.384Z
timeEstimate: 40
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
