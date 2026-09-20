---
pm-task: true
projectId: "[[03 Data Ingestion and Providers|03 Data Ingestion and Providers]]"
parentId:
id: t_alt_ing_018
title: Verify ingestion and SimpleFIN quality gate
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - milestone
  - providers
  - quality
subtaskIds: []
dependencies:
  - "[[implement-simplefin-connection|Implement SimpleFIN connection]]"
  - "[[build-resumable-import-wizard|Build resumable import wizard]]"
  - "[[build-family-export-ui|Build family export UI]]"
  - "[[add-frontend-ci-and-performance-budgets|Add frontend CI and performance budgets]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:40.072Z
timeEstimate: 40
---

Verify SimpleFIN plus import/export meets API-only parity, security, accessibility, and release-quality requirements.

## Acceptance criteria
- Execute the SimpleFIN state machine's success, cancellation, expiry, recovery, sync, account-linking, and disconnect evidence.
- Prove credentials/tokens/raw payloads do not enter browser persistence, client bundles, logs, traces, screenshots, or error messages.
- Pass WCAG 2.2 AA, responsive evergreen-browser checks, OpenAPI drift, performance budgets, and role authorization tests.
- Confirm every other enabled provider remains represented in the V2 Providers workstream.
- Record SimpleFIN sandbox limitations and manual verification evidence without marking untested paths complete.

## Verification
- The SimpleFIN/import/export matrix has no unexplained gap and no unresolved critical/high defect.

Project: [[03 Data Ingestion and Providers]]
