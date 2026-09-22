---
pm-task: true
projectId: "[[06 Pivot Chart Experience|06 Pivot Chart Experience]]"
parentId:
id: t_cd_pivot_004
title: Version and migrate pivot chart configuration
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - persistence
  - charts
subtaskIds: []
dependencies:
  - "[[define-the-pivot-chart-contract|Define the pivot chart contract]]"
  - "[[capture-the-proven-local-dashboard-shape|Capture the proven local dashboard shape]]"
createdAt: 2026-09-22T00:00:00.000Z
updatedAt: 2026-09-22T00:00:00.000Z
timeEstimate: 8
---

Persist explicit chart intent without coupling it to query results or grid-vendor types.

## Ownership boundary

Own dashboard snapshot schemas, chart configuration types, normalization, migration, and seed updates. Do not render charts or execute queries.

## Acceptance criteria

- Add a versioned pivot-chart configuration to `DashboardReport`, validated independently from report name, SureQL source, presentation choice, and layout.
- Store stable field names and explicit user choices only; never persist result rows, generated SQL, inferred axis domains, colors, or TanStack Charts objects.
- Migrate legacy `presentation: "chart"` reports without losing name, query, or layout: use table presentation until the user previews and saves an explicit pivot configuration.
- Preserve a saved pivot configuration while temporarily viewing the same report as a table, and invalidate it visibly when a changed query no longer returns required fields.
- Make malformed or future chart configurations degrade to the report table without discarding the surrounding dashboard.
- Update starter data only when it has a reviewed explicit chart example; repeated loading and migration remain idempotent.

## Verification

- Exercise legacy snapshots, valid V1 pivot specs, missing fields, unknown versions, malformed nested values, table/chart switching, reset, refresh, and two-user localStorage isolation.

Project: [[06 Pivot Chart Experience]]
