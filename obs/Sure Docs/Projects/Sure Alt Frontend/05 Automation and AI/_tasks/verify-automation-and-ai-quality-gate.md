---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_007"
title: "Verify automation and AI quality gate"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestone", "ai", "quality"]
subtaskIds: []
dependencies: ["t_alt_auto_001", "t_alt_auto_002", "t_alt_auto_003", "t_alt_auto_004", "t_alt_auto_005", "t_alt_auto_006", "t_alt_fnd_017"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Verify recurring, rules, insights, chat, AI settings, and push workflows meet parity and safety gates.

## Acceptance criteria
- Execute workflow-matrix success/failure/retry/disabled/role paths against a configured and unconfigured Rails environment.
- Prove AI prompts, messages, tool data, notification endpoints, and financial context are absent from unsafe logs/artifacts.
- Pass WCAG 2.2 AA, responsive evergreen browsers, contract drift, security, and performance budgets.
- Verify idempotency for rule application, message submission/retry, refresh, recurring actions, and subscriptions.
- Record evidence and linked defects in the parity matrix.

## Verification
- No required automation/AI row or critical/high defect remains open.

Project: [[05 Automation and AI]]
