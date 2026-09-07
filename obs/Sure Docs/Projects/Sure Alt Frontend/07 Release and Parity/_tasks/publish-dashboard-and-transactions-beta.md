---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_004"
title: "Publish dashboard and transactions beta"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["release", "beta", "milestone"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_rel_002", "t_alt_rel_003"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Publish the production-quality beta containing existing-user login, dashboard, transaction editing, sync, PWA resilience, and self-hosted packaging.

## Acceptance criteria
- Freeze compatible Rails/OpenAPI/frontend/image versions and publish immutable release artifacts with checksums and notes.
- Include installation/upgrade/rollback steps, known deferred parity areas, security considerations, and support diagnostics.
- Verify a fresh Compose install and upgrade from the documented prior state.
- Make beta labeling and incomplete-workflow boundaries explicit; do not link unsupported flows to Rails HTML.
- Archive quality-gate evidence and create linked tasks for release-discovered defects.

## Verification
- Released artifacts reproduce the signed-off beta report and complete the documented smoke test on a clean environment.

Project: [[07 Release and Parity]]
