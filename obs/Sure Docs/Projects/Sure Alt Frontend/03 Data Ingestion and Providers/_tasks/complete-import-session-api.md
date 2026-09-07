---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_014"
title: "Complete import session API"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["imports", "api", "backend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Complete the import API state machine needed for parity with upload, configuration, cleaning, mapping, review, publish, cancel, revert, and templates.

## Acceptance criteria
- Reconcile existing import/preflight/session/chunk/rows/publish operations with Rails import routes and the parity matrix.
- Add missing typed operations for CSV/QIF stages, row edits, mappings, category selection, summary, cancel/revert, and template application.
- Support bounded resumable/chunked uploads with checksums, idempotency, expiration, progress, and cleanup.
- Return stable row-level validation/error structures without leaking filesystem paths or raw exception data.
- Authorize every import by family/user and preserve the import ID on recoverable publish failure.

## Verification
- Minitest behavior and state transitions, docs-only rswag/OpenAPI, and large/interrupted upload tests pass.

Project: [[03 Data Ingestion and Providers]]
