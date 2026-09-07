---
pm-task: true
projectId: "p_lfp_04"
parentId: null
id: "t_lfp_304"
title: "Model debt repayment and forgiveness"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["debt", "cash-flow"]
subtaskIds: []
dependencies: ["t_lfp_204", "t_lfp_301"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Project amortizing and non-amortizing liabilities, normal payments, accelerated payoff, refinancing effects, and forgiveness.

## Acceptance criteria
- Debt models support principal, APR precision, payment frequency, minimum payment, term, start/end dates, and linked financed assets.
- Normal amortization separates interest and principal and handles partial first/last years.
- Extra-payment flows support fixed amounts, remaining income, balance percentage, maximum payoff, and milestone/time windows.
- Forgiveness can occur at a date/milestone or through routed income and records taxable consequences where applicable.
- Offset accounts reduce eligible mortgage interest without reducing either recorded balance incorrectly.

## Verification
- Compare normal versus early payoff for mortgage, student loan, credit debt, forgiven debt, and offset mortgage scenarios.

Project: [[04 Cash Flow Goals and Debt]]
