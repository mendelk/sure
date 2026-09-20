---
pm-task: true
projectId: "[[07 Release and Parity|07 Release and Parity]]"
parentId:
id: t_alt_rel_011
title: Publish V2 providers release
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
  - v2
subtaskIds: []
dependencies:
  - "[[verify-v2-provider-quality-gate|Verify V2 provider quality gate]]"
  - "[[publish-automation-settings-and-admin-release|Publish automation settings and admin release]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:48.941Z
timeEstimate: 24
---

Publish the V2 release adding every supported provider connection other than SimpleFIN.

## Acceptance criteria
- Freeze compatible contracts/artifacts and list every enabled non-SimpleFIN provider with tested capabilities and sandbox/manual evidence.
- Document callback/configuration changes, credential handling, provider limitations, migration, and rollback.
- Verify upgrade from the final V1 staged release without disrupting SimpleFIN or existing sessions/connections.
- Run provider smoke tests against release artifacts and preserve sanitized evidence.
- Do not mark providers complete when only mocked paths were tested; state exact validation level.

## Verification
- Immutable artifacts pass the V2 provider quality report on the documented self-hosted topology.

Project: [[07 Release and Parity]]
