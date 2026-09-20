---
pm-task: true
projectId: "[[07 Release and Parity|07 Release and Parity]]"
parentId:
id: t_alt_rel_004
title: Publish dashboard and transactions beta
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - release
  - beta
  - milestone
subtaskIds: []
dependencies:
  - "[[verify-production-beta-quality-gate|Verify production beta quality gate]]"
  - "[[integrate-the-frontend-service-with-docker-compose|Integrate the frontend service with Docker Compose]]"
  - "[[document-self-hosted-configuration-and-operations|Document self-hosted configuration and operations]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:41.122Z
timeEstimate: 24
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
