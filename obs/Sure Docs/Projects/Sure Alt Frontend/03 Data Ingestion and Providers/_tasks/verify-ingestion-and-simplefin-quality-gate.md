---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_018"
title: "Verify ingestion and SimpleFIN quality gate"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestone", "providers", "quality"]
subtaskIds: []
dependencies: ["t_alt_ing_007", "t_alt_ing_015", "t_alt_ing_017", "t_alt_fnd_017"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
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
