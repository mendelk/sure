---
pm-task: true
projectId: "[[07 Release and Parity|07 Release and Parity]]"
parentId:
id: t_alt_rel_002
title: Integrate the frontend service with Docker Compose
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - docker
  - self-hosting
  - operations
subtaskIds: []
dependencies:
  - "[[containerize-the-tanstack-start-frontend|Containerize the TanStack Start frontend]]"
  - "[[enforce-sure-api-compatibility-checks|Enforce Sure API compatibility checks]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:38.142Z
timeEstimate: 28
---

Add the separate frontend service to example self-hosted Compose topology with an internal/configurable Rails API origin.

## Acceptance criteria
- Add explicit networks, dependencies, health checks, restart behavior, ports/origin variables, and secret guidance.
- Keep Rails available internally to the BFF while documenting whether/how operators expose the legacy web app separately.
- Define public URL, secure-cookie, proxy-header, TLS termination, and callback URL requirements.
- Avoid default credentials and prevent the internal Rails hostname from reaching browser output.
- Preserve existing database/Redis/worker behavior and provide an opt-in migration path for current deployments.

## Verification
- A clean Compose stack reaches frontend readiness, login, dashboard, API compatibility check, and graceful dependency-failure states.

Project: [[07 Release and Parity]]
