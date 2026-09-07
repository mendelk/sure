---
pm-task: true
projectId: "p_lfp_12"
parentId: null
id: "t_lfp_1101"
title: "Guide users from current finances to first plan"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["onboarding", "plans"]
subtaskIds: []
dependencies: ["t_lfp_104", "t_lfp_201", "t_lfp_202", "t_lfp_203", "t_lfp_204", "t_lfp_301"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Provide a guided setup that converts Sure's existing household data into a useful first projection without requiring every advanced input.

## Acceptance criteria
- Setup reviews household/location, current finances, milestones, income, flows, expenses, real assets, assumptions, and warnings in a resumable sequence.
- Existing Sure data is prefilled with source labels and never duplicated merely to satisfy onboarding.
- Required inputs are minimal; optional advanced fields can be deferred without hiding material assumptions.
- The resulting plan identifies defaults, estimated values, missing basis/tax data, and unsupported account behavior.
- Users can restart, skip to a template, or revise any section after creation.

## Verification
- Complete setup for a new manual household, an existing synced household, a couple, and a user with no accounts.

Project: [[12 Onboarding Portability and Platform]]
