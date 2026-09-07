---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_012"
title: "Build frontend and Rails integration test harness"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["testing", "frontend", "rails"]
subtaskIds: []
dependencies: ["t_alt_fnd_002", "t_alt_fnd_003", "t_alt_fnd_005"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Provide Vitest, React Testing Library, and Playwright infrastructure, including critical tests against a real Rails test API and database.

## Acceptance criteria
- Configure unit/component tests with accessible queries, deterministic time/timezone, and typed API fixtures.
- Provide contract-derived mock handlers for focused tests without making mocks the only integration evidence.
- Start isolated Rails, PostgreSQL, Redis, and TanStack services for Playwright with repeatable seeded users and finance data.
- Expose helpers for login, session expiry, roles, API failures, mobile viewports, theme, and privacy mode.
- Capture trace/screenshot artifacts only after masking known sensitive fixture regions.

## Verification
- A CI-friendly smoke suite proves browser to BFF to Rails to database behavior and reliably cleans up processes/data.

Project: [[01 Foundation]]
