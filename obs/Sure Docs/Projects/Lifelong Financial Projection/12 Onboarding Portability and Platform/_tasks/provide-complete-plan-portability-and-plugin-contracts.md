---
pm-task: true
projectId: "p_lfp_12"
parentId: null
id: "t_lfp_1105"
title: "Provide complete plan portability and plugin contracts"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["portability", "plugins", "exports"]
subtaskIds: []
dependencies: ["t_lfp_004", "t_lfp_201", "t_lfp_804"]
timeEstimate: 40
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Extend Sure's import/export model so complete plans can be backed up, migrated, integrated, and inspected without proprietary lock-in.

## Acceptance criteria
- JSON export/import includes household planning facts, plans, revisions, events, milestones, flows, assumptions, custom plots, progress, and ruleset references.
- Imports validate schema/version, preview changes, map accounts/people, and fail atomically on unresolved critical references.
- A versioned API supports approved tools that read/write current-finance planning inputs and plan structures within explicit scopes.
- Plugins cannot bypass household/advisor permissions or access secrets and provider credentials.
- Exported plans remain useful when a tax/historical ruleset is unavailable by preserving input provenance and clear degradation behavior.

## Verification
- Round-trip a complex international couple plan and test old schema migration, collisions, missing accounts, and least-privilege plugin access.

Project: [[12 Onboarding Portability and Platform]]
