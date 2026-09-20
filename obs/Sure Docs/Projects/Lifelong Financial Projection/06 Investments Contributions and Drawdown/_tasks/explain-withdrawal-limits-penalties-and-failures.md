---
pm-task: true
projectId: "[[06 Investments Contributions and Drawdown|06 Investments Contributions and Drawdown]]"
parentId: "[[implement-account-liquidity-and-drawdown-order|Implement account liquidity and drawdown order]]"
id: t_lfp_504_3
title: Explain withdrawal limits, penalties, and failures
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - drawdown
  - explainability
subtaskIds: []
dependencies:
  - "[[execute-tax-aware-drawdown-order|Execute tax-aware drawdown order]]"
timeEstimate: 12
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Report how each requested withdrawal was fulfilled, limited, taxed, penalized, shielded, or left unfunded.

## Acceptance criteria
- Results retain requested/gross/net amounts, account, rule, tax, withholding, and penalty.
- Early-withdrawal and account-lock warnings identify the affected years and alternatives.
- Failed withdrawals connect directly to the plan's shortfall explanation.

## Verification
- Inspect explanations for successful, penalized, partially funded, and impossible withdrawals.

Project: [[06 Investments Contributions and Drawdown]]
