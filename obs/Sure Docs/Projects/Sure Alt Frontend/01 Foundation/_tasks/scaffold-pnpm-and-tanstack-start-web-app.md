---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_002"
title: "Scaffold pnpm and TanStack Start web app"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "foundation"]
subtaskIds: []
dependencies: []
timeEstimate: 16
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Create a Node 24 pnpm workspace with the React TanStack Start application at `apps/web/`.

## Acceptance criteria
- Add a repository workspace manifest and committed pnpm lockfile without breaking existing Rails asset scripts.
- Scaffold TanStack Start with TanStack Router and Query using strict TypeScript and supported Vite defaults.
- Provide root and app-level commands for development, production build, preview, typecheck, and clean installation.
- Add an environment example for the deployment-level Sure API origin; fail startup with a clear error when it is invalid.
- Document how to run Rails and the web app together locally.

## Verification
- A clean `pnpm install --frozen-lockfile` and production build succeed on Node 24.
- The starter route renders through SSR and hydrates without console errors.

Project: [[01 Foundation]]
