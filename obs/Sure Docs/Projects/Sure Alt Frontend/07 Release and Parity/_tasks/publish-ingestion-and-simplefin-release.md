---
pm-task: true
projectId: "[[07 Release and Parity|07 Release and Parity]]"
parentId:
id: t_alt_rel_005
title: Publish ingestion and SimpleFIN release
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - release
  - providers
  - milestone
subtaskIds: []
dependencies:
  - "[[verify-ingestion-and-simplefin-quality-gate|Verify ingestion and SimpleFIN quality gate]]"
  - "[[publish-dashboard-and-transactions-beta|Publish dashboard and transactions beta]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:43.059Z
timeEstimate: 24
---

Publish the staged release adding shared provider connection management, SimpleFIN, and import/export workflows.

## Acceptance criteria
- Freeze compatible contracts/artifacts and list SimpleFIN's tested capabilities and sandbox/manual evidence.
- Document callback/configuration changes, credential handling, import/export limits, migration, rollback, and known upstream limitations.
- Verify fresh install and beta upgrade paths without invalidating existing BFF sessions unexpectedly.
- Run SimpleFIN/import/export smoke tests against the release artifacts and preserve sanitized evidence.
- Identify other providers as V2 work rather than implying they are supported by this release.

## Verification
- Immutable artifacts pass the ingestion and SimpleFIN quality report on the documented self-hosted topology.

Project: [[07 Release and Parity]]
