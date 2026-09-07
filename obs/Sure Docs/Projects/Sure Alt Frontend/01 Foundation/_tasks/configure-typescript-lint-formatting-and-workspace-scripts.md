---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_003"
title: "Configure TypeScript lint formatting and workspace scripts"
type: "task"
status: "done"
priority: "high"
start: ""
due: ""
progress: 100
assignees: []
tags: ["frontend", "tooling"]
subtaskIds: []
dependencies: ["t_alt_fnd_002"]
timeEstimate: 12
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Establish consistent TypeScript and source-quality rules for the pnpm workspace.

## Acceptance criteria

- Enable the strictest TypeScript settings with separate browser, server, and test boundaries.
- Configure formatting and linting for TS, TSX, JSON, CSS-related source, and workspace manifests while preserving existing repository checks. Use oxlint, and typeaware linting for maximum performance and type-safety
- Enforce no client import of server-only modules and no accidental use of Node APIs in browser bundles.
- Add root commands that run checks across current and future workspace packages.
- Document naming, route, query-key, test, and environment conventions in `apps/web/`.

## Verification

- Typecheck, lint, and format-check commands pass from the repository root and report deliberate fixture violations.

Project: [[01 Foundation]]
