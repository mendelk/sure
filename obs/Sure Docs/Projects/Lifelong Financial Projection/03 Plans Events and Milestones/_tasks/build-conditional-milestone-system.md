---
pm-task: true
projectId: "p_lfp_03"
parentId: null
id: "t_lfp_205"
title: "Build conditional milestone system"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestones", "rules"]
subtaskIds: []
dependencies: ["t_lfp_201"]
timeEstimate: 40
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Allow life decisions and plan phases to activate when dates or financial conditions are met rather than only at fixed ages.

## Acceptance criteria
- Required retirement and life-expectancy milestones coexist with unlimited custom, financial-independence, debt-free, account-target, move, marriage, and partner-life-expectancy milestones.
- Criteria compare age, spouse age, calendar date/year, plan year, net worth, liquid net worth, spending, debt, account balance, passive income, and other supported metrics.
- Multiple criteria support AND/OR logic, before/after operators, negative offsets, and first/last matching semantics.
- Milestones bind event starts/ends, trigger relocation or tax consequences, and remain activatable without losing configuration.
- Simulation results record never-reached milestones and completion timing across deterministic and stochastic runs.

## Verification
- Prove compound examples such as "retire when liquid net worth is 25x spending and mortgage is paid, or at age 55."

Project: [[03 Plans Events and Milestones]]
