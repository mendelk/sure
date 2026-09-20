---
pm-task: true
projectId: "[[08 Scenarios Risk and Optimization|08 Scenarios Risk and Optimization]]"
parentId:
id: t_lfp_704
title: Define and analyze chance of success
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - risk
  - analytics
subtaskIds:
  - "[[configure-success-objectives-and-outcome-bands|Configure success objectives and outcome bands]]"
  - "[[aggregate-trial-distributions-and-milestone-timing|Aggregate trial distributions and milestone timing]]"
  - "[[filter-and-inspect-monte-carlo-trials|Filter and inspect Monte Carlo trials]]"
dependencies:
  - "[[run-configurable-monte-carlo-simulations|Run configurable Monte Carlo simulations]]"
  - "[[build-conditional-milestone-system|Build conditional milestone system]]"
  - "[[model-flexible-spending-behavior|Model flexible spending behavior]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Summarize the full distribution of plan outcomes without reducing success to a single opaque percentage.

## Acceptance criteria
- Users define outcome categories, thresholds, names, descriptions, and presentation for large surplus through early failure.
- Success can incorporate solvency, terminal wealth, milestone completion, spending, legacy, or other selected objectives.
- Results include percentile/fan trajectories, histograms, summary statistics, milestone timing distributions, completion rates, and IQRs.
- Trials can be filtered by outcome, histogram range, variable milestone timing, or all selected milestone criteria.
- Any trial can be inspected with sampled assumptions, sequence, yearly ledger, metrics, milestones, and failure explanation.

## Verification
- Known synthetic trial sets produce exact categories, percentiles, milestone distributions, filters, and drill-down records.

Project: [[08 Scenarios Risk and Optimization]]
