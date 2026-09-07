---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_003"
title: "Document self-hosted configuration and operations"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["documentation", "self-hosting", "operations"]
subtaskIds: []
dependencies: ["t_alt_rel_002"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Document installation, configuration, upgrades, rollback, backup boundaries, troubleshooting, and security for the alternate frontend service.

## Acceptance criteria
- Provide quick-start and production examples for API origin, public origin, cookies/session secrets, TLS/reverse proxy, health, logs, and PWA updates.
- Explain API compatibility failures, release pairing, credential rotation, logout impact, and zero/low-downtime upgrade order.
- Document which data lives in Rails versus ephemeral/persistent frontend session storage and what operators must back up.
- Include migration/coexistence guidance for the legacy Rails frontend and no-Rails-HTML guarantee for supported flows.
- Cover provider callback URLs and optional AI/push/SSO configuration without embedding real secrets.

## Verification
- Follow the guide from a clean host to a working login and validate every command/example in CI or a release checklist.

Project: [[07 Release and Parity]]
