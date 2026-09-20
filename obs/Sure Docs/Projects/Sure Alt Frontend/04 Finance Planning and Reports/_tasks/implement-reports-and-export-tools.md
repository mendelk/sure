---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_010
title: Implement reports and export tools
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - reports
  - api
  - charts
subtaskIds: []
dependencies:
  - "[[audit-web-parity-surface-and-api-gap-matrix|Audit web parity surface and API gap matrix]]"
  - "[[build-responsive-app-shell-and-route-guards|Build responsive app shell and route guards]]"
  - "[[evaluate-tanstack-charts-for-sure-visualizations|Evaluate TanStack Charts for Sure visualizations]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
---

API-enable and implement the reports hub, preferences, transaction export, print-friendly output, and Google Sheets guidance.

## Acceptance criteria
- Define bounded report datasets/aggregates and URL-driven period/account/category filters without shipping unnecessary raw history.
- Build accessible charts with table/text alternatives and privacy-aware print/export behavior.
- Persist report preferences through an explicit API and role-scoped contract.
- Stream authorized transaction exports through the BFF with safe content headers and no service-worker caching.
- Provide static Google Sheets instructions without embedding credentials or analytics.

## Verification
- Contract and browser tests cover filters, multi-currency/negative/empty data, preferences, export, print, privacy, and performance budgets.

Project: [[04 Finance Planning and Reports]]
