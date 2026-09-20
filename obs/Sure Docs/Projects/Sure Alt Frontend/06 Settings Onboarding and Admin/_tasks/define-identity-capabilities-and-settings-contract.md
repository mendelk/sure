---
pm-task: true
projectId: "[[06 Settings Onboarding and Admin|06 Settings Onboarding and Admin]]"
parentId:
id: t_alt_set_001
title: Define identity capabilities and settings contract
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - settings
  - api
  - authorization
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[generate-openapi-types-and-typed-fetch-client|Generate OpenAPI types and typed fetch client]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:34.994Z
timeEstimate: 36
---

Define the authenticated identity, family, role/capability, deployment feature, and settings resources needed to render safe navigation and forms.

## Acceptance criteria
- Return current user/family identity, role, verified/active state, locale/theme preferences, onboarding state, and explicit capabilities.
- Expose deployment-level feature availability for providers, AI, SSO, passkeys/MFA, MCP, admin, and self-hosted-only surfaces without secrets.
- Specify typed read/update resources rather than a generic settings hash.
- Make authorization server-enforced; client capabilities are presentation hints only.
- Define cache/revalidation behavior so role/deactivation changes take effect promptly.

## Verification
- Minitest covers roles/features/cross-family denial; docs-only rswag and regenerated OpenAPI define all resources.

Project: [[06 Settings Onboarding and Admin]]
