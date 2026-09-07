---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_003"
title: "Build provider catalog and settings UI"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "frontend", "settings"]
subtaskIds: []
dependencies: ["t_alt_ing_002", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build the shared provider catalog and connection-management surface used by every provider flow.

## Acceptance criteria
- Group available, connected, unavailable, misconfigured, and manual import options with capability-based actions.
- Show safe status, last sync, affected accounts, reconnect/review needs, and support guidance.
- Provide accessible responsive connect, manage, sync, and disconnect entry points with destructive confirmation.
- Poll only active transitions and refresh narrowly after provider actions.
- Never render secret values or raw provider responses; integrate privacy mode for account/balance details.

## Verification
- Component and Playwright tests cover roles, empty/provider states, keyboard/mobile use, sync, disconnect, and safe errors.

Project: [[03 Data Ingestion and Providers]]
