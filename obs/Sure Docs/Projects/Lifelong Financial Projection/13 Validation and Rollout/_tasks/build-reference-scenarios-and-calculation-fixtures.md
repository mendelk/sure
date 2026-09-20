---
pm-task: true
projectId: "[[13 Validation and Rollout|13 Validation and Rollout]]"
parentId:
id: t_lfp_1201
title: Build reference scenarios and calculation fixtures
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - quality
  - fixtures
  - validation
subtaskIds:
  - "[[build-hand-calculable-financial-fixtures|Build hand-calculable financial fixtures]]"
  - "[[build-realistic-lifecycle-reference-plans|Build realistic lifecycle reference plans]]"
  - "[[build-stochastic-and-optimizer-reference-runs|Build stochastic and optimizer reference runs]]"
dependencies:
  - "[[establish-functional-parity-catalog|Establish functional parity catalog]]"
  - "[[define-calculation-versioning-and-reproducibility|Define calculation versioning and reproducibility]]"
  - "[[make-simulation-results-auditable-and-repeatable|Make simulation results auditable and repeatable]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
