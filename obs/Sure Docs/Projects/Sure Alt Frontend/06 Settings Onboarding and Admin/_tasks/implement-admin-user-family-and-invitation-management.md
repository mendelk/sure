---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_011
title: Implement admin user family and invitation management
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - admin
  - frontend
  - api
subtaskIds: []
dependencies:
  - "[[define-super-admin-api-and-authorization|Define super-admin API and authorization]]"
  - "[[build-frontend-and-rails-integration-test-harness|Build frontend and Rails integration test harness]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

Implement super-admin user, deletion review, family, pending invitation, invite-code, and supported role/status management.

## Acceptance criteria
- Build paginated/filterable responsive admin lists/details from the explicit admin contract.
- Show impact previews and typed confirmations before user/family/invitation/invite-code deletion or status/role changes.
- Preserve last-super-admin and active-session protections defined by Rails.
- Refresh affected resources/capabilities without exposing unrelated family financial data.
- Display auditable success/error correlation while redacting personal data from diagnostics.

## Verification
- Rails behavior/docs and Playwright cover each action, normal-user denial, last-admin protection, stale records, and destructive confirmations.

Project: [[06 Settings Onboarding and Admin]]
