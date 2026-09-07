---
pm-task: true
projectId: "p_lfp_06"
parentId: null
id: "t_lfp_501"
title: "Model investment returns, dividends, and fees"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "simulation"]
subtaskIds: []
dependencies: ["t_lfp_401", "t_lfp_403", "t_lfp_103"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Project account growth with separate appreciation, dividend, bond-income, cash-yield, and fee components.

## Acceptance criteria
- Plans define default rates while accounts may inherit or override fixed rates, historical sequences, or custom schedules.
- Dividends support reinvestment time windows and account overrides; non-reinvested income enters cash flow.
- US dividend composition distinguishes qualified and ordinary; bonds distinguish municipal, Treasury, and other income.
- International composition can express eligible/non-eligible/foreign or franked/unfranked dividends and applicable credits.
- Annual fees reduce the appropriate account without being mistaken for spending or investment loss.

## Verification
- Account balances reconcile under mixed growth, dividends, reinvestment, fees, taxes, and partial years.

Project: [[06 Investments Contributions and Drawdown]]
