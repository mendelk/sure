---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_004"
title: "Implement resilient AI chat"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["ai", "chat", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012", "t_alt_fnd_014"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Implement chat list/detail/create/rename/delete, message submission, retry, tool-call presentation, timeout recovery, and responsive conversation UI.

## Acceptance criteria
- Reconcile current chat/message API behavior with Rails timeout reporting/retry and add typed operations or streaming/status support where needed.
- Render user/assistant content safely, distinguish tool calls/results, and never execute model-provided markup or links implicitly.
- Prevent duplicate messages, recover interrupted responses, and expose timeout/retry/cancel states without indefinite polling.
- Preserve scroll/focus/accessibility behavior, mobile input ergonomics, privacy mode, and reduced motion.
- Redact message/tool content from server logs, traces, screenshots, and error reports.

## Verification
- Rails behavior/docs and Playwright cover complete turns, tool calls, timeout, retry, refresh recovery, deletion, and disabled/unavailable AI.

Project: [[05 Automation and AI]]
