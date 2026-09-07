---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_005"
title: "Publish ingestion and SimpleFIN release"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["release", "providers", "milestone"]
subtaskIds: []
dependencies: ["t_alt_ing_018", "t_alt_rel_004"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
