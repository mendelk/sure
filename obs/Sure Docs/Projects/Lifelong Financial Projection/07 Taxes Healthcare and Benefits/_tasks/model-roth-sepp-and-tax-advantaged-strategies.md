---
pm-task: true
projectId: "p_lfp_07"
parentId: null
id: "t_lfp_607"
title: "Model Roth, SEPP, and tax-advantaged strategies"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "strategies", "retirement"]
subtaskIds: ["t_lfp_607_1", "t_lfp_607_2", "t_lfp_607_3"]
dependencies: ["t_lfp_503", "t_lfp_504", "t_lfp_602"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Support deliberate account conversions and early-retirement access strategies with correct tax and penalty behavior.

## Acceptance criteria
- Roth conversions support source/destination accounts, time ranges, annual amounts, brackets/ceilings, withholding, basis, and conversion restrictions.
- Backdoor and mega backdoor Roth operations coordinate contributions and conversions without double-counting limits or cash flow.
- 72(t)/SEPP supports RMD, fixed-amortization, and custom methods, eligible account scope, duration, and non-qualified Roth treatment.
- Strategy analyzers compare lifetime taxes, net worth, RMDs, IRMAA, ACA effects, and net legacy against baseline.
- International equivalents such as RRSP meltdown remain expressible through country-specific strategy modules.

## Verification
- Validate conversion ladders, pro-rata/basis cases, early-access penalties, SEPP schedules, and strategy cancellation boundaries.

Project: [[07 Taxes Healthcare and Benefits]]
