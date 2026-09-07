---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_011"
title: "Implement admin user family and invitation management"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["admin", "frontend", "api"]
subtaskIds: []
dependencies: ["t_alt_set_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
