---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_009
title: Implement new-user onboarding
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - onboarding
  - frontend
  - api
subtaskIds: []
dependencies:
  - "[[implement-profile-preferences-and-appearance|Implement profile preferences and appearance]]"
  - "[[implement-signup-recovery-and-sso-entry-flows|Implement signup recovery and SSO entry flows]]"
  - "[[implement-family-membership-invitations-and-sharing|Implement family membership invitations and sharing]]"
  - "[[build-manual-account-forms-for-all-account-types|Build manual account forms for all account types]]"
  - "[[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

API-enable and implement late-phase onboarding preferences, goals, account/provider choice, invitations, and completion for new users.

## Acceptance criteria
- Reconcile `/onboarding`, preferences, goals, and trial behavior with self-hosted scope; exclude hosted subscription requirements.
- Make each step resumable/idempotent and derive next/allowed steps from server state.
- Reuse manual-account/provider/family/goal workflows rather than creating onboarding-only data paths.
- Support skip/back/re-entry, empty provider configuration, invitees versus family creators, mobile layouts, and accessibility.
- Route completed users to the dashboard and prevent redirect loops or stale onboarding state.

## Verification
- Rails-backed Playwright covers new family, invitee, manual account, provider path, resumed/skipped steps, and completion.

Project: [[06 Settings Onboarding and Admin]]
