---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_004
title: Implement MFA and passkey management
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - security
  - mfa
  - webauthn
subtaskIds: []
dependencies:
  - "[[implement-password-email-and-session-management|Implement password email and session management]]"
  - "[[threat-model-browser-authentication-and-bff|Threat-model browser authentication and BFF]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

API-enable MFA setup/verification/disable and WebAuthn/passkey registration, sign-in verification, listing, and removal.

## Acceptance criteria
- Define short-lived challenge resources bound to user/session/origin with replay protection and generic failures.
- Extend login to complete OTP or passkey-required states while keeping the first beta's basic login behavior stable.
- Implement QR/secret/recovery guidance without persisting secrets in browser storage or logs.
- Build WebAuthn feature detection, naming, registration, login, and removal with safe fallback paths.
- Prevent removing the last required factor or locking out a user without explicit backend-approved recovery.

## Verification
- Security review and Rails/browser tests cover setup, verification, replay, cancellation, wrong/expired codes, passkey login, rename/remove, and fallback.

Project: [[06 Settings Onboarding and Admin]]
