---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_009
title: Design server persistence from the proven local shape
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - database-handoff
  - architecture
  - storage
subtaskIds: []
dependencies:
  - "[[validate-parity-and-release-in-usable-stages|Validate parity and release in usable stages]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:57:02.062Z
timeEstimate: 12
---

Translate the accepted local product into a minimal server data contract only after every required behavior and invariant is known.

## Ownership boundary
Own the persistence mapping and migration plan. Do not create tables, models, endpoints, dual writes, or background synchronization in this task.

## Acceptance criteria
- Map proven records, relationships, ownership, revisions, integrity constraints, retention, and deletion behavior from the local plan.
- Define atomic writes, optimistic conflicts, authorization, encryption, audit, backup, restore, and managed/self-hosted requirements.
- Specify import of local plans, idempotency, dry-run summaries, rollback, and degraded missing-rule or account states.
- Reject fields, tables, and abstractions that exist only for discarded experiments or hypothetical future features.

## Verification
- Walk every accepted product action and invariant against the proposed contract and remove any storage element with no observable consumer.

Project: [[07 Productize the Proven Direction]]
