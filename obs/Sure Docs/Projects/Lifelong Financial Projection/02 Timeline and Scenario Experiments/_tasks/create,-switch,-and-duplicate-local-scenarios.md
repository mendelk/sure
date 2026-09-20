---
pm-task: true
projectId: "[[02 Timeline and Scenario Experiments|02 Timeline and Scenario Experiments]]"
parentId:
id: "t_lfp_timeline_005"
title: "Create, switch, and duplicate local scenarios"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["scenarios", "local-storage", "frontend"]
subtaskIds: []
dependencies: ["[[add-goals-and-milestones|Add goals and milestones]]", "[[model-debts-and-real-asset-life-cycles|Model debts and real asset life cycles]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:50.427Z"
timeEstimate: 8
---

Let users explore alternatives without losing the accepted baseline plan.

## Ownership boundary
Own a small local scenario collection and selector. No server IDs, sharing, synchronization, or database-ready repository.

## Acceptance criteria
- Create, rename, duplicate, switch, and delete local scenarios.
- Keep one explicit baseline scenario and preserve independent assumptions and events.
- Require confirmation when deleting the active or only scenario.
- Restore the same active scenario and results after reload.

## Verification
- Create two divergent scenarios, switch and reload, duplicate one, delete one, and confirm the baseline remains intact.

Project: [[02 Timeline and Scenario Experiments|02 Timeline and Scenario Experiments]]