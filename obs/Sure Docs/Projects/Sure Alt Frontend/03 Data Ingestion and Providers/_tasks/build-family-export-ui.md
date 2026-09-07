---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_017"
title: "Build family export UI"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["exports", "frontend", "downloads"]
subtaskIds: []
dependencies: ["t_alt_ing_016", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build family export history and lifecycle controls with secure download behavior.

## Acceptance criteria
- List status, timestamps, filename/size, availability, and permitted actions with responsive accessible presentation.
- Create exports once, poll active jobs adaptively, and stop on terminal/offline/hidden states.
- Support authorized download, cancellation, and deletion with progress, confirmation, and stable errors.
- Avoid exposing download credentials in DOM, URL history, logs, or service-worker caches.
- Explain retention/expiry and provide recovery for failed or missing files.

## Verification
- Component and Rails-backed Playwright tests cover create, poll, download, cancel, delete, expiry, and authorization failures.

Project: [[03 Data Ingestion and Providers]]
