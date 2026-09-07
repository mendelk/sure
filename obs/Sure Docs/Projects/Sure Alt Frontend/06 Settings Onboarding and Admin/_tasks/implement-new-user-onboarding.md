---
pm-task: true
projectId: "p_alt_settings"
parentId: null
id: "t_alt_set_009"
title: "Implement new-user onboarding"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["onboarding", "frontend", "api"]
subtaskIds: []
dependencies: ["t_alt_set_002", "t_alt_set_005", "t_alt_set_007", "t_alt_fin_002", "t_alt_ing_003"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement late-phase onboarding preferences, goals, account/provider choice, invitations, and completion for new users.

## Acceptance criteria
- Reconcile `/onboarding`, preferences, goals, and trial behavior with self-hosted scope; exclude hosted subscription requirements.
- Make each step resumable/idempotent and derive next/allowed steps from server state.
- Reuse manual-account/provider/family/goal workflows rather than creating onboarding-only data paths.
- Support skip/back/re-entry, empty provider configuration, invitees versus family creators, mobile layouts, and accessibility.
- Route completed users to the dashboard and prevent redirect loops or stale onboarding state.

## Verification
- Rails-backed Playwright covers new family, invitee, manual account, provider path, resumed/skipped steps, and completion.

Project: [[06 Settings Onboarding and Admin]]
