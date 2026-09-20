---
pm-task: true
projectId: "[[13 Validation and Rollout|13 Validation and Rollout]]"
parentId:
id: t_lfp_1203
title: Deliver safe plan migrations and recovery
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - migrations
  - recovery
  - quality
subtaskIds: []
dependencies:
  - "[[define-calculation-versioning-and-reproducibility|Define calculation versioning and reproducibility]]"
  - "[[provide-complete-plan-portability-and-plugin-contracts|Provide complete plan portability and plugin contracts]]"
  - "[[protect-and-synchronize-planning-data|Protect and synchronize planning data]]"
timeEstimate: 36
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Protect long-lived plans as schemas, defaults, account mappings, and financial rules evolve over decades.

## Acceptance criteria
- Schema changes migrate through versioned, idempotent transformations with dry-run summaries and recoverable failures.
- Meaning-changing migrations require review of affected plans and preserve the prior revision for comparison or rollback.
- Missing accounts, rulesets, historical series, plugins, or currencies produce actionable degraded states rather than data loss.
- Backups and exports can restore complete plans and progress into a clean installation.
- Concurrent migration and edit attempts are serialized or rejected safely.

## Verification
- Migrate representative fixtures from every released plan schema, interrupt migrations, and prove recovery and replay.

Project: [[13 Validation and Rollout]]
