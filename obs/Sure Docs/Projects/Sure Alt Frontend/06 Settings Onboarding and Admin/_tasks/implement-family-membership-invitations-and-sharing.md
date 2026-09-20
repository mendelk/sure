---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_007
title: Implement family membership invitations and sharing
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - family
  - sharing
  - api
subtaskIds: []
dependencies:
  - "[[define-identity-capabilities-and-settings-contract|Define identity capabilities and settings contract]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:45.327Z
timeEstimate: 40
---

API-enable and implement family member/role management, invitations, invitation acceptance, default sharing, per-account sharing, and revocation.

## Acceptance criteria
- Define family members, pending invites, roles/capabilities, account access, and allowed transitions without leaking data to non-members.
- Add invite/create/revoke/accept and role/share updates with expiry, duplicate, last-admin, and self-change protections.
- Build responsive member/invite/account-sharing surfaces with explicit access impact and confirmations.
- Refresh current capabilities/navigation immediately after role or membership changes.
- Cover invitation links through the BFF without Rails HTML fallback or open redirects.

## Verification
- Minitest/docs/OpenAPI and multi-user Playwright cover invite/accept/revoke, role changes, account sharing, default sharing, and denial.

Project: [[06 Settings Onboarding and Admin]]
