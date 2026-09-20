---
pm-task: true
projectId: "[[09 Analytics Reports and Progress|09 Analytics Reports and Progress]]"
parentId:
id: t_lfp_804
title: Build custom plots, tables, and exports
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - analytics
  - reports
  - exports
subtaskIds: []
dependencies:
  - "[[deliver-yearly-summary-and-core-plan-metrics|Deliver yearly summary and core plan metrics]]"
  - "[[compare-plans-and-run-reversible-what-if-changes|Compare plans and run reversible what-if changes]]"
timeEstimate: 36
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Let users explore any compatible result metrics together and obtain portable, auditable reports.

## Acceptance criteria
- A plot definition selects metrics, aggregation, line items, chart/table representation, colors, time range, percentiles, and comparison baseline.
- Built-in analyses cover net worth, stacked accounts, liquid wealth, income, spending, taxes, contributions, withdrawals, debt, allocation, and goals.
- Every plot can be viewed as accessible tabular data and any result table can optionally include its related chart.
- Reports export PDF, CSV, and JSON with plan inputs, assumptions, ruleset versions, warnings, and selected results.
- Exported numbers match interactive results and preserve real/nominal currency context.

## Verification
- Round-trip JSON and cross-format reconciliation tests cover built-in, custom, compare, tax, chance-of-success, and estate reports.

Project: [[09 Analytics Reports and Progress]]
