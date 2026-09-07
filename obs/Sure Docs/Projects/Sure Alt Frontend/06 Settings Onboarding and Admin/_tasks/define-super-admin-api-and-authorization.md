---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_010"
title: "Define super-admin API and authorization"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["admin", "api", "security"]
subtaskIds: []
dependencies: ["t_alt_set_001", "t_alt_fnd_006"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Define a versioned admin API with explicit super-admin authorization for users, families, invitations, SSO providers/blocks, health, and queue tooling.

## Acceptance criteria
- Inventory every `/admin` route plus protected Sidekiq/system-health behavior and map it to typed resources/actions.
- Use a separate admin namespace/scope and deny API-key or OAuth credentials lacking explicit admin authority.
- Define pagination/filtering, capability/allowed-action fields, confirmation requirements, stable errors, and audit metadata.
- Minimize returned personal data and never expose credentials, raw configuration secrets, or unrestricted queue payloads.
- Threat-model destructive and impersonation-adjacent operations; include impersonation parity if the matrix requires it.

## Verification
- Authorization tests prove normal admins/users and cross-family actors cannot access any admin operation; OpenAPI is regenerated.

Project: [[06 Settings Onboarding and Admin]]
