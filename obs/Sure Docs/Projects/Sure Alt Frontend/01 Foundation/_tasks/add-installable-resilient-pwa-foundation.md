---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_013"
title: "Add installable resilient PWA foundation"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["pwa", "frontend"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_010", "t_alt_fnd_011"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Make the web app installable and resilient without pretending financial mutations work offline.

## Acceptance criteria
- Add a valid manifest, owned icons, theme colors, display settings, and install metadata.
- Cache only versioned static assets/app shell; never cache authenticated API responses in shared service-worker storage.
- Show clear offline/stale/reconnected states and preserve safe in-progress form input locally without queued submission.
- Define service-worker update and rollback UX that does not strand active sessions.
- Document browser limitations and privacy constraints.

## Verification
- Installability audits pass and Playwright covers offline navigation, blocked writes, reconnection, and service-worker updates.

Project: [[01 Foundation]]
