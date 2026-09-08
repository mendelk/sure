---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_018"
title: "Complete advanced account settings and sharing"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "settings", "sharing", "providers"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fin_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 32
createdAt: "2026-09-08T04:00:00.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Extend the proven manual-account workflow with advanced settings and ownership operations that are not required for the core milestone.

## Acceptance criteria

- Add default-account and report-exclusion settings with explicit generated contracts.
- Add provider unlinking with capability checks, clear consequences, and explicit confirmation.
- Add supported sharing and ownership changes with family/role authorization and cross-family denial.
- Add advanced subtype metadata for property, vehicle, investment, crypto, loan, and other specialized accounts where the Rails model supports it.
- Preserve existing core account behavior and provide safe migration/default handling for previously created accounts.

## Verification

- Minitest covers each advanced operation and authorization boundary; rswag remains documentation-only and OpenAPI artifacts are regenerated.
- Component and Rails-backed integration tests cover settings, sharing, unlinking, validation, and rollback.

Project: [[04 Finance Planning and Reports]]
