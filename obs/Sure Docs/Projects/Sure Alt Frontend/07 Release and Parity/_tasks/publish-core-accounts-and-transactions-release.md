---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_004"
title: "Publish core accounts and transactions release"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["release", "core", "milestone"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_rel_002", "t_alt_rel_003"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Publish the production-quality first release containing existing-user login, core manual account management, account navigation, transaction browsing, transaction editing, category assignment, and self-hosted packaging.

## Acceptance criteria
- Freeze compatible Rails/OpenAPI/frontend/image versions and publish immutable release artifacts with checksums and notes.
- Include installation/upgrade/rollback steps, known deferred parity areas, security considerations, and support diagnostics.
- Verify a fresh Compose install and upgrade from the documented prior state.
- Make deferred dashboard, chart, provider, import, report, planning, and parity boundaries explicit; do not link unsupported flows to Rails HTML.
- Archive quality-gate evidence and create linked tasks for release-discovered defects.

## Verification
- Released artifacts reproduce the signed-off beta report and complete the documented smoke test on a clean environment.

Project: [[07 Release and Parity]]
