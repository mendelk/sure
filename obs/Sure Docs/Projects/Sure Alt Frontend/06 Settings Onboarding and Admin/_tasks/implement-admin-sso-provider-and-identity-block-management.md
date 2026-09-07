---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_012"
title: "Implement admin SSO provider and identity block management"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["admin", "sso", "security"]
subtaskIds: []
dependencies: ["t_alt_set_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Implement super-admin SSO-provider CRUD/toggle/test and blocked-identity review/removal through redacted APIs.

## Acceptance criteria
- Use provider-specific typed configuration fields and one-time secret submission; return only presence/fingerprint metadata for saved secrets.
- Validate issuer/redirect configuration and prevent SSRF in discovery/test operations.
- Build accessible forms, enable/disable confirmation, connection test results, and identity-block lists/actions.
- Require explicit admin capability and preserve blocked-identity audit semantics.
- Never log, serialize, or redisplay client secrets, tokens, discovery payloads, or sensitive raw failures.

## Verification
- Security tests cover SSRF/redaction/authz; Rails/browser tests cover CRUD, toggle, test, invalid config, block removal, and stale records.

Project: [[06 Settings Onboarding and Admin]]
