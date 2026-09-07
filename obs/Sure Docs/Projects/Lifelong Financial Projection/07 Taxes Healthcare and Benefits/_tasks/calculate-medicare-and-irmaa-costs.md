---
pm-task: true
projectId: "p_lfp_07"
parentId: "t_lfp_605"
id: "t_lfp_605_3"
title: "Calculate Medicare and IRMAA costs"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["healthcare", "medicare", "irmaa"]
subtaskIds: []
dependencies: ["t_lfp_605_2"]
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Project owner-specific Medicare premiums and IRMAA surcharges using enrollment and lookback-income rules.

## Acceptance criteria
- Part B, Part D, supplements, enrollment ages, and owner timing remain separate inputs.
- IRMAA uses correct filing status, thresholds, tax-year version, and lookback period.
- Costs appear consistently in healthcare, cash flow, tax strategy, and optimization results.

## Verification
- Test enrollment transitions and income immediately below/above every modeled IRMAA cliff.

Project: [[07 Taxes Healthcare and Benefits]]
