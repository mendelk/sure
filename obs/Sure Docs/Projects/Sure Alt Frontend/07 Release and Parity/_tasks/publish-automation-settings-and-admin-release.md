---
pm-task: true
projectId: "[[07 Release and Parity|07 Release and Parity]]"
parentId:
id: t_alt_rel_007
title: Publish automation settings and admin release
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - release
  - admin
  - milestone
subtaskIds: []
dependencies:
  - "[[verify-automation-and-ai-quality-gate|Verify automation and AI quality gate]]"
  - "[[verify-settings-onboarding-and-admin-quality-gate|Verify settings onboarding and admin quality gate]]"
  - "[[publish-finance-and-planning-release|Publish finance and planning release]]"
timeEstimate: 24
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Publish the staged release adding automation, AI, security/auth, family, onboarding, operational settings, and super-admin workflows.

## Acceptance criteria
- Freeze compatible artifacts and publish both automation/AI and settings/admin quality evidence.
- Document optional AI/push/SSO/passkey requirements, admin API exposure, destructive operations, migration, and rollback.
- Verify fresh install and prior-release upgrade as normal user, family admin, super-admin, invitee, and new user.
- Confirm hosted billing/native-client exclusions and all sensitive-data redaction controls.
- Track release defects explicitly without weakening role/security gates.

## Verification
- Immutable artifacts pass both quality reports and documented role-based self-hosted smoke tests.

Project: [[07 Release and Parity]]
