---
pm-task: true
projectId: "p_alt_automation"
parentId: null
id: "t_alt_auto_005"
title: "Implement AI settings prompts and usage"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["ai", "settings", "api"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_010", "t_alt_fnd_012"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement AI availability/enablement, user rule-prompt settings, prompt inspection, usage, and safe self-hosted guidance.

## Acceptance criteria
- Expose capability/configuration state and role-appropriate settings without returning model-provider secrets.
- Add typed update operations for user AI/rule preferences and current Rails prompt settings where editable.
- Present usage units/time ranges and limitations accurately without product analytics.
- Require explicit consent before enabling AI and explain what financial context may be sent to the configured provider.
- Handle unavailable/misconfigured/local-provider and rate/budget limit states.

## Verification
- Rails behavior/docs and browser tests cover enablement, preferences, prompt visibility, usage, roles, and disabled configuration.

Project: [[05 Automation and AI]]
