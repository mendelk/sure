---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_005"
title: "Implement signup recovery and SSO entry flows"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["auth", "sso", "onboarding"]
subtaskIds: []
dependencies: ["t_alt_set_003", "t_alt_set_004"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Complete signup/invite code, password reset, passwordless passkey, configured OIDC SSO, identity linking, and JIT account entry flows through the BFF.

## Acceptance criteria
- Reconcile existing mobile JSON auth operations with browser-safe redirects/cookies and add missing reset/passkey endpoints.
- Preserve PKCE/state/nonce, linking-code expiry/single use, invite policy, blocked identity, MFA, and account-creation policy.
- Avoid account enumeration and unsafe open redirects; keep reset/linking/token values out of logs and persisted client state.
- Build accessible responsive entry/recovery forms with explicit configured/unavailable paths.
- Establish the secure BFF session after every successful route and continue to onboarding when required.

## Verification
- Rails and Playwright security scenarios cover signup, invite, reset, passkey, SSO login/link/JIT, replay, blocked identity, and failures.

Project: [[06 Settings Onboarding and Admin]]
