---
pm-task: true
projectId: "p_lfp_03"
parentId: null
id: "t_lfp_201"
title: "Manage independent scenario plans"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["plans", "scenarios"]
subtaskIds: []
dependencies: ["t_lfp_003", "t_lfp_004", "t_lfp_104"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Support multiple named financial plans that can start from current finances, custom starting conditions, an existing plan, or a guided template.

## Acceptance criteria
- Plans can be created, named, described, reordered, cloned, archived, restored, and deleted independently.
- Plans may begin now or on a fixed historical/future date and define an explicit end condition.
- Cloning preserves all events, milestones, assumptions, notes, account mappings, and calculation provenance without sharing mutable state.
- Users can update a plan from a newer current-finance snapshot through a reviewable merge.
- Plans with different start/end years remain comparable where their timelines overlap.

## Verification
- Lifecycle tests cover blank plans, templates, clones, custom baselines, archived plans, and cross-date comparisons.

Project: [[03 Plans Events and Milestones]]
