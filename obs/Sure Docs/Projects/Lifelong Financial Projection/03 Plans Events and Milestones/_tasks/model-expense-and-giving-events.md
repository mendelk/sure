---
pm-task: true
projectId: "p_lfp_03"
parentId: null
id: "t_lfp_203"
title: "Model expense and giving events"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["events", "expenses"]
subtaskIds: []
dependencies: ["t_lfp_201"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Model ongoing and one-time expenses with the same timing and change-over-time power as income.

## Acceptance criteria
- Presets cover living, healthcare, education, travel, wedding, childcare, support, charity, taxes, and custom expenses without double-counting financed-asset costs.
- Expenses support ownership, frequency, start/end month, milestone bindings, real/nominal values, custom growth, and payroll deduction treatment.
- Spending classification supports essential, discretionary, not-spending, and hybrid with a discretionary percentage.
- An expense may be funded from ordered specific accounts, including HSA/education accounts, before normal drawdown.
- Tax deductibility supports jurisdiction scope, itemization requirements, deduction type, carryforward, and tax-year timing.

## Verification
- Fixtures cover mixed discretionary expenses, future healthcare growth, payroll deductions, education-account funding, and deductions.

Project: [[03 Plans Events and Milestones]]
