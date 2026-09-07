---
pm-task: true
projectId: "p_lfp_05"
parentId: null
id: "t_lfp_402"
title: "Support calendar, rolling, and fiscal-year alignment"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["simulation", "time"]
subtaskIds: []
dependencies: ["t_lfp_401"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Allow annual simulation periods to align with calendar years, rolling years from the plan start, or jurisdiction-specific fiscal/tax years.

## Acceptance criteria
- The selected alignment defines period boundaries, ages, labels, tax-year rules, and event proration consistently.
- Plans starting mid-year report full-year context while applying only the overlapping event fraction.
- Birthdays, retirement eligibility, contribution limits, RMD ages, and tax legislation activate in the correct simulation period.
- Compare mode aligns plans with different dates by real calendar interval where possible.
- Changing alignment produces a reviewable semantic warning rather than silently shifting events.

## Verification
- Boundary fixtures cover leap years, birthdays, mid-month starts, non-calendar tax years, and legislation effective dates.

Project: [[05 Deterministic Simulation Engine]]
