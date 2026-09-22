---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_009
title: Verify and select the pivot chart experience
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - verification
  - product-review
  - charts
subtaskIds: []
dependencies:
  - "[[integrate-pivot-preview-save-and-fallback|Integrate pivot preview, save, and fallback]]"
  - "[[harden-pivot-security-cardinality-and-performance|Harden pivot security, cardinality, and performance]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 8
---

Review the complete pivot-chart loop with real financial data, then remove behavior that did not prove useful.

## Ownership boundary

Own the end-to-end checkpoint, regression fixes, and deletion instructions across the pivot slice. Do not retain rejected variants or compatibility paths for hypothetical future use.

## Acceptance criteria

- Demonstrate transaction count, monthly cash flow, category spending, account balances, and multi-measure comparisons using authorized real data.
- Cover empty, null-heavy, negative, mixed-currency-labelled, wide, high-cardinality, truncated, invalid, slow, and failed results without losing access to the data table.
- Cover create/edit/save/cancel/refresh/reset, query schema drift, malformed storage, multiple dashboards, multiple cards, and restricted users.
- Review desktop, tablet, phone, narrow and wide cards, light/dark, privacy mode, reduced motion, 200 percent zoom, pointer, and keyboard-only use.
- Mark each chart type, field control, aggregation, format, fallback, and limit keep/change/delete based on observed use.
- Remove the legacy automatic first-date/first-number mapper and all obsolete persisted fields, branches, copy, and tests after migration behavior is proven.

## Verification

- The actual `/dashboards` route completes the accepted walkthrough; focused server checks prove totals and authorization; focused client checks prove persistence and stale-request behavior; no rejected path remains reachable.

Project: [[06 Pivot Chart Experience]]
