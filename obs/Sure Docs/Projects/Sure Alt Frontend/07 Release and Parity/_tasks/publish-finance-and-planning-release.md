---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_006"
title: "Publish finance and planning release"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["release", "finance", "milestone"]
subtaskIds: []
dependencies: ["t_alt_fin_017", "t_alt_rel_005"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Publish the staged release adding complete account, investment, transfer, report, budget, goal, and planning workflows.

## Acceptance criteria
- Freeze compatible contracts/artifacts and publish finance/planning quality evidence.
- Document calculation/currency caveats, API changes, migration/rollback, and newly supported workflows.
- Verify fresh install and prior staged-release upgrade with representative manual/provider/shared/multi-currency families.
- Confirm privacy masking and exported/printed outputs behave as documented.
- Create linked defects for any release-only regression rather than weakening parity criteria.

## Verification
- Immutable artifacts pass the finance quality report and self-hosted smoke tests.

Project: [[07 Release and Parity]]
