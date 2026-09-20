---
pm-task: true
projectId: "[[06 Investments Contributions and Drawdown|06 Investments Contributions and Drawdown]]"
parentId:
id: t_lfp_504
title: Implement account liquidity and drawdown order
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - investments
  - drawdown
subtaskIds:
  - "[[configure-account-access-and-liquidity|Configure account access and liquidity]]"
  - "[[execute-tax-aware-drawdown-order|Execute tax-aware drawdown order]]"
  - "[[explain-withdrawal-limits-penalties-and-failures|Explain withdrawal limits, penalties, and failures]]"
dependencies:
  - "[[implement-the-annual-simulation-ledger|Implement the annual simulation ledger]]"
  - "[[complete-planning-account-taxonomy|Complete planning account taxonomy]]"
  - "[[support-transfers-routing-and-multi-account-funding|Support transfers, routing, and multi-account funding]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
