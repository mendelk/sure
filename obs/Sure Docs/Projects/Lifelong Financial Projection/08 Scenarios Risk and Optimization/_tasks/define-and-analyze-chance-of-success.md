---
pm-task: true
projectId: "p_lfp_08"
parentId: null
id: "t_lfp_704"
title: "Define and analyze chance of success"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["risk", "analytics"]
subtaskIds: ["t_lfp_704_1", "t_lfp_704_2", "t_lfp_704_3"]
dependencies: ["t_lfp_703", "t_lfp_205", "t_lfp_305"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
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
