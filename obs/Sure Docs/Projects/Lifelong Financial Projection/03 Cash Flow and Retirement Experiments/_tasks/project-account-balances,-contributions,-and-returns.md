---
pm-task: true
projectId: "[[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]"
parentId:
id: "t_lfp_flows_001"
title: "Project account balances, contributions, and returns"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "investments", "simulation"]
subtaskIds: []
dependencies: ["[[compare-and-review-timeline-scenarios|Compare and review timeline scenarios]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:44.320Z"
timeEstimate: 12
---

Turn the accepted household projection into account-level accumulation that still rolls up to the same visible result.

## Ownership boundary
Support the account types exercised by current scenarios. Avoid a complete planning taxonomy or pluggable calculation engine.

## Acceptance criteria
- Project cash, taxable investment, tax-advantaged retirement, debt, and real-asset balances separately.
- Apply explicit contributions, employer match, returns, dividends, fees, and simple allocation assumptions.
- Show household totals as exact rollups of account results.
- Keep unsupported account behavior visible and conservative rather than silently approximated.

## Verification
- Run representative accumulation plans and reconcile account-level balances to the household table and chart.

Project: [[03 Cash Flow and Retirement Experiments|03 Cash Flow and Retirement Experiments]]