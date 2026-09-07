---
pm-task: true
projectId: "p_lfp_06"
parentId: null
id: "t_lfp_504"
title: "Implement account liquidity and drawdown order"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["investments", "drawdown"]
subtaskIds: ["t_lfp_504_1", "t_lfp_504_2", "t_lfp_504_3"]
dependencies: ["t_lfp_401", "t_lfp_102", "t_lfp_303"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Fund plan shortfalls from eligible accounts and real assets in a user-defined order while respecting access and tax constraints.

## Acceptance criteria
- Drawdown order can rank account types, individual accounts, and eligible real-asset liquidation.
- Accounts can be unavailable until an age/milestone, prohibit early withdrawals, or permit them with penalties and warnings.
- Withdrawals account for taxability, basis, withholding, conversion restrictions, destination cash, and same-year liquidity needs.
- Income-aware withdrawal splitting supports couples and separate filing without assigning all income to one person arbitrarily.
- Results explain withdrawals requested, grossed up for taxes, limited by liquidity, shielded, penalized, or left unfunded.

## Verification
- Test taxable-first, tax-deferred-first, account locks, early penalties, couple splitting, and real-asset liquidation.

Project: [[06 Investments Contributions and Drawdown]]
