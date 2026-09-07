---
pm-task: true
projectId: "p_lfp_07"
parentId: "t_lfp_602"
id: "t_lfp_602_3"
title: "Calculate US state and local taxes"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "us", "state-local"]
subtaskIds: []
dependencies: ["t_lfp_602_2"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Calculate maintained state and supported locality taxes with source-specific retirement and investment rules.

## Acceptance criteria
- State presets define brackets, deductions, exemptions, credits, and taxable-source differences.
- Supported local taxes compose with state and federal liabilities without double-counting income.
- Relocation applies explicit effective dates and reports changed tax burden.

## Verification
- Validate representative high-tax, low-tax, no-income-tax, and local-tax locations.

Project: [[07 Taxes Healthcare and Benefits]]
