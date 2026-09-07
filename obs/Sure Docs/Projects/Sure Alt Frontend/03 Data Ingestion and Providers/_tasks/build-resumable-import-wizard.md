---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_015"
title: "Build resumable import wizard"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["imports", "frontend", "uploads"]
subtaskIds: []
dependencies: ["t_alt_ing_014", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Build a responsive import wizard that can resume the server-declared import stage after refresh or interruption.

## Acceptance criteria
- Implement drag/drop and picker upload, configuration, mapping, clean/invalid row review, confirmation, publish, summary, cancel, revert, and template flows.
- Render large row sets accessibly and efficiently with stable edits and clear row-level errors.
- Upload directly through the BFF with progress/cancellation and resume only when the API confirms chunk state.
- Prevent duplicate publish and warn before abandoning destructive/irreversible stages.
- Handle CSV/QIF variants, mobile layouts, expired sessions, offline state, and privacy-safe artifacts.

## Verification
- Rails-backed Playwright covers successful, invalid-row, interrupted/resumed, cancelled, reverted, and publish-failure imports.

Project: [[03 Data Ingestion and Providers]]
