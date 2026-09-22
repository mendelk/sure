---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_001
title: Define the pivot chart contract
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - charts
  - product-contract
  - sureql
subtaskIds: []
dependencies:
  - "[[refine-the-selected-first-slice|Refine the selected first slice]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 6
---

Define one implementable pivot-chart model before changing storage, query execution, or rendering.

## Ownership boundary

Own the product behavior, configuration vocabulary, examples, and compatibility matrix. Do not build UI or introduce a generalized analytics schema.

## Acceptance criteria

- Define category, optional series, measures, aggregation, date bucket, sort, top-N, chart type, and value-format fields with defaults and validation rules.
- Lock V1 to one category plus either one measure and optional series or up to three measures without a series; document why combinations outside this boundary are rejected.
- Define type compatibility for `count`, `count distinct`, `sum`, `average`, `minimum`, and `maximum`, including null handling and date bucketing.
- Define line, grouped-bar, and stacked-bar eligibility, ordering, negative-value behavior, and the accessible table representation.
- State that explicit SureQL filters and `take` clauses are respected, but the executor's automatic 50-row preview cap is never applied before aggregation.
- Provide representative transaction, account, monthly cash-flow, category-breakdown, empty, and invalid examples with expected grouped results.

## Verification

- Review the examples against real SureQL output and confirm every configuration field has an immediate UI, executor, renderer, or persistence consumer.

Project: [[06 Pivot Chart Experience]]
