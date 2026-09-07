---
pm-task: true
projectId: "p_lfp_06"
parentId: null
id: "t_lfp_506"
title: "Support retirement withdrawal strategies and annuities"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["retirement", "drawdown", "strategies"]
subtaskIds: []
dependencies: ["t_lfp_504", "t_lfp_501", "t_lfp_205"]
timeEstimate: 40
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Provide a separate strategy-analysis mode for textbook withdrawal rules and variable lifetime income annuities.

## Acceptance criteria
- Strategies include initial percentage/X% rule, ratcheting safe withdrawal rate, VPW, Clyatt 95%, Guyton-Klinger, and extensible custom rules.
- A strategy begins at a date/milestone and can treat its amount as desired spending or total gross withdrawals.
- Strategy mode clearly identifies which normal expenses and asset purchases it overrides after activation.
- Withdrawal-rate metrics subtract reinvested inflows and expose both planned and strategy-derived spending.
- Variable lifetime annuities model purchase, payout basis, age, growth/adjustment, guarantee, and survivor behavior.

## Verification
- Compare each strategy against the same normal plan and confirm override, tax, drawdown, and failure behavior.

Project: [[06 Investments Contributions and Drawdown]]
