---
pm-task: true
projectId: "p_lfp_13"
parentId: null
id: "t_lfp_1201"
title: "Build reference scenarios and calculation fixtures"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "fixtures", "validation"]
subtaskIds: ["t_lfp_1201_1", "t_lfp_1201_2", "t_lfp_1201_3"]
dependencies: ["t_lfp_001", "t_lfp_004", "t_lfp_405"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Create transparent, reviewable financial scenarios that become the acceptance baseline for each calculation domain.

## Acceptance criteria
- Fixtures span single/couple households, accumulation, FIRE, retirement, relocation, debt, home/rental assets, survivor, international, and estate phases.
- Each fixture includes inputs, expected annual ledger, taxes, account balances, milestones, metrics, warnings, and tolerance rationale.
- Small hand-computable examples coexist with larger realistic plans and published governmental examples.
- Deterministic, historical, Monte Carlo, and optimization runs have stable manifests and expected structural results.
- Sensitive production data is never required to validate financial logic.

## Verification
- Independent review reproduces selected fixture years from source rules and basic arithmetic.

Project: [[13 Validation and Rollout]]
