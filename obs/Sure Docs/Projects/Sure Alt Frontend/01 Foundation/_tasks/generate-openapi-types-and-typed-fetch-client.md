---
pm-task: true
projectId: "[[01 Foundation|01 Foundation]]"
parentId:
id: t_alt_fnd_004
title: Generate OpenAPI types and typed fetch client
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - openapi
  - api
subtaskIds: []
dependencies:
  - "[[scaffold-pnpm-and-tanstack-start-web-app|Scaffold pnpm and TanStack Start web app]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:30.521Z
timeEstimate: 20
---

Generate TypeScript path/schema types from `docs/api/openapi.yaml` and expose a thin typed fetch layer for TanStack Query.

## Acceptance criteria
- Choose and document a maintained types-plus-fetch generator; do not generate a second state-management abstraction.
- Commit deterministic generated output and a single regeneration command.
- Normalize success, validation, authorization, rate-limit, and network failures into a typed application error.
- Support pagination, query parameters, JSON bodies, file responses, cancellation, and request correlation.
- Add representative compile-time and runtime tests without hand-copying OpenAPI model interfaces.

## Verification
- Regeneration produces no diff from a clean checkout.
- CI can fail when `docs/api/openapi.yaml` and generated output drift.

Project: [[01 Foundation]]
