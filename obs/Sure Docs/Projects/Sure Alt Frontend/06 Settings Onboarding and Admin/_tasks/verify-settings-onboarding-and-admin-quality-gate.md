---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_015
title: Verify settings onboarding and admin quality gate
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - milestone
  - admin
  - quality
subtaskIds: []
dependencies:
  - "[[implement-profile-preferences-and-appearance|Implement profile preferences and appearance]]"
  - "[[implement-password-email-and-session-management|Implement password email and session management]]"
  - "[[implement-mfa-and-passkey-management|Implement MFA and passkey management]]"
  - "[[implement-signup-recovery-and-sso-entry-flows|Implement signup recovery and SSO entry flows]]"
  - "[[implement-api-key-and-mcp-settings|Implement API key and MCP settings]]"
  - "[[implement-family-membership-invitations-and-sharing|Implement family membership invitations and sharing]]"
  - "[[implement-hosting-debug-and-background-job-settings|Implement hosting debug and background job settings]]"
  - "[[implement-new-user-onboarding|Implement new-user onboarding]]"
  - "[[implement-admin-user-family-and-invitation-management|Implement admin user family and invitation management]]"
  - "[[implement-admin-sso-provider-and-identity-block-management|Implement admin SSO provider and identity block management]]"
  - "[[implement-admin-system-health-and-queue-tools|Implement admin system health and queue tools]]"
  - "[[implement-guarded-reset-and-account-deletion|Implement guarded reset and account deletion]]"
  - "[[implement-admin-impersonation-sessions|Implement admin impersonation sessions]]"
  - "[[add-frontend-ci-and-performance-budgets|Add frontend CI and performance budgets]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:58.893Z
timeEstimate: 40
---

Verify user, family, auth/security, onboarding, hosting, and super-admin workflows meet parity and release gates.

## Acceptance criteria
- Execute the role matrix as user, family member/admin, super-admin, invitee, new user, deactivated user, and unauthenticated visitor.
- Prove secrets, session data, admin diagnostics, and deleted/reset data do not leak to browser state, logs, caches, or artifacts.
- Pass WCAG 2.2 AA, responsive evergreen browsers, contract drift, CSRF/SSRF/authz controls, and performance budgets.
- Confirm hosted billing and native-client exclusions while accounting for every other settings/admin route.
- Update parity evidence and linked defects.

## Verification
- No required settings/onboarding/admin row or critical/high defect remains open.

Project: [[06 Settings Onboarding and Admin]]
