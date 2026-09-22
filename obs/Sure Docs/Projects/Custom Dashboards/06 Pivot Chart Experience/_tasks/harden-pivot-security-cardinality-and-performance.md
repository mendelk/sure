---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_008
title: Harden pivot security, cardinality, and performance
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - security
  - performance
  - charts
subtaskIds: []
dependencies:
  - "[[execute-pivot-aggregations-on-the-server|Execute pivot aggregations on the server]]"
  - "[[integrate-pivot-preview-save-and-fallback|Integrate pivot preview, save, and fallback]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 8
---

Bound the new aggregation surface before treating pivot charts as durable dashboard behavior.

## Ownership boundary

Own security and resource limits across pivot validation, execution, transport, and rendering. Fix the source boundary; do not hide unsafe behavior behind UI-only limits.

## Acceptance criteria

- Prove every pivot request passes through existing account authorization and cannot select an unreturned field, inject an identifier/expression, or execute a write statement.
- Enforce server-side limits for categories, series, measures, response cells, execution time, and payload size; return typed actionable errors or explicit truncation metadata.
- Require explicit top-N and sort semantics when a configuration would exceed the visual cardinality budget; never silently drop groups.
- Abort superseded browser requests and avoid duplicate execution for identical saved query-and-pivot keys.
- Keep one slow or failed chart from blocking dashboard navigation, editing, or sibling report cards.
- Measure representative small and worst-allowed pivots and record the accepted latency and payload ceilings used by verification.

## Verification

- Exercise unauthorized accounts, crafted field names, malformed specs, high-cardinality dimensions, wide series, slow queries, oversized responses, cancellation, and concurrent cards against the real endpoint.

Project: [[06 Pivot Chart Experience]]
