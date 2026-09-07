---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_010"
title: "Publish full web parity release"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["release", "parity", "milestone"]
subtaskIds: []
dependencies: ["t_alt_rel_003", "t_alt_rel_009"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Publish the full self-hosted and super-admin web-parity release of the alternate Sure frontend.

## Acceptance criteria
- Publish immutable frontend/container artifacts, checksums/SBOM, compatible Sure API range, release notes, and upgrade/rollback documentation.
- Link the closed parity matrix and final quality report as completion evidence.
- Clearly state hosted billing and native-client exclusions and the API-only supported-flow guarantee.
- Verify release artifacts on a clean self-hosted deployment and from every supported staged upgrade path.
- Define ongoing OpenAPI compatibility, security update, browser support, and selected chart-library upgrade policies.

## Verification
- Release artifacts reproduce the final report with no unresolved critical/high issue and all project completion criteria met.

Project: [[07 Release and Parity]]
