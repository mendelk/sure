---
pm-task: true
projectId: "p_lfp_13"
parentId: "t_lfp_1201"
id: "t_lfp_1201_1"
title: "Build hand-calculable financial fixtures"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "fixtures"]
subtaskIds: []
dependencies: []
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Create small fixtures whose yearly balances, flows, taxes, and metrics can be reproduced independently with basic arithmetic.

## Acceptance criteria
- Each calculation primitive has normal and boundary examples with cited expectations.
- Inputs, processing order, exact ledger, and rounding are documented.
- Fixtures contain no sensitive production data.

## Verification
- A reviewer reproduces selected years without running Sure.

Project: [[13 Validation and Rollout]]
