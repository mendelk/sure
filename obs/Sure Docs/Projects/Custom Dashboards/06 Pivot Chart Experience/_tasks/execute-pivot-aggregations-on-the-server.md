---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_003
title: Execute pivot aggregations on the server
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - backend
  - sureql
  - security
  - charts
subtaskIds: []
dependencies:
  - "[[define-the-pivot-chart-contract|Define the pivot chart contract]]"
  - "[[return-typed-sureql-field-metadata|Return typed SureQL field metadata]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 12
---

Aggregate the authorized SureQL result on the server so charts are correct beyond the preview row limit.

## Ownership boundary

Own pivot specification validation and execution at the existing SureQL boundary. Keep authorization in `Sureql::Compiler`; do not add raw model scopes, client-composed SQL, or a second reporting language.

## Acceptance criteria

- Accept a versioned pivot specification with the SureQL source and reject unknown fields, incompatible aggregations, unsupported combinations, and malformed limits before executing SQL.
- Compile and authorize the base SureQL exactly once, wrap it as a read-only subquery, and apply only allowlisted grouping, bucketing, aggregate, ordering, and top-N operations with quoted identifiers.
- Aggregate before the executor's automatic preview row cap while still respecting filters, joins, sorts, and explicit `take` behavior authored in SureQL.
- Return a stable pivot result containing ordered categories, series, measures, raw values, field metadata, truncation/cardinality flags, and the generated SQL technical disclosure.
- Preserve null semantics from the contract and distinguish an empty result from an invalid specification or execution error.
- Keep ordinary table execution unchanged when no pivot specification is supplied.

## Verification

- Compare pivot results with direct database totals for authorized and restricted users; cover injection-shaped field names, duplicate aliases, null groups, negative values, date buckets, explicit `take`, and results larger than 50 base rows.

Project: [[06 Pivot Chart Experience]]
