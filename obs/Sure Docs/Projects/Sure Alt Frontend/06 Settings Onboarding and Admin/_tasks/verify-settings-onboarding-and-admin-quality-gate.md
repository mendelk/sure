---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_015"
title: "Verify settings onboarding and admin quality gate"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestone", "admin", "quality"]
subtaskIds: []
dependencies: ["t_alt_set_002", "t_alt_set_003", "t_alt_set_004", "t_alt_set_005", "t_alt_set_006", "t_alt_set_007", "t_alt_set_008", "t_alt_set_009", "t_alt_set_011", "t_alt_set_012", "t_alt_set_013", "t_alt_set_014", "t_alt_set_016", "t_alt_fnd_017"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
