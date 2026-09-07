---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_001"
title: "Containerize the TanStack Start frontend"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["docker", "deployment", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fnd_002", "t_alt_fnd_014", "t_alt_fnd_017"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build a production container for the TanStack Start server as a separate self-hosted service.

## Acceptance criteria
- Use a reproducible multi-stage Node 24/pnpm build with frozen dependencies and a minimal non-root runtime.
- Include only production output/dependencies, owned PWA assets, health endpoint support, and required licenses/notices.
- Read the Sure API origin and secrets at runtime rather than baking them into images or browser bundles.
- Add sensible signals, graceful shutdown, read-only filesystem compatibility where practical, and container health checks.
- Document supported architectures and image tagging/version metadata.

## Verification
- Build and run the image locally; scan it for known vulnerabilities/secrets and verify health, shutdown, and client-bundle configuration leakage.

Project: [[07 Release and Parity]]
