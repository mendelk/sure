---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_002
title: Return typed SureQL field metadata
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - backend
  - sureql
  - api
subtaskIds: []
dependencies:
  - "[[define-the-pivot-chart-contract|Define the pivot chart contract]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 8
---

Give the configurator trustworthy field names and types without inferring them from a few browser rows.

## Ownership boundary

Own the existing SureQL result contract and its TypeScript validation. Do not expose database tables, unrestricted schema metadata, or fields outside the compiled query result.

## Acceptance criteria

- Add ordered field metadata to successful SureQL results: returned name, database type, normalized semantic kind, nullability when knowable, and aggregation capabilities.
- Derive metadata from the executed compiled query so aliases, expressions, aggregates, and zero-row results remain usable.
- Normalize database types into the small contract needed by the configurator: text, number, currency-compatible number, boolean, date, datetime, and unknown.
- Preserve the existing columns/rows contract during the slice, then remove duplicate inference once all dashboard consumers use metadata.
- Return no schema details for a query that fails compilation, authorization, or execution.
- Update the client schema and error handling so unknown future types degrade to `unknown` rather than crashing the route.

## Verification

- Exercise aliased expressions, aggregate columns, null-only columns, dates, timestamps, numeric values, booleans, empty results, and invalid queries through the real endpoint.

Project: [[06 Pivot Chart Experience]]
