---
pm-task: true
projectId: "p_lfp_07"
parentId: "t_lfp_601"
id: "t_lfp_601_1"
title: "Define versioned jurisdiction ruleset contract"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["tax", "rulesets"]
subtaskIds: []
dependencies: []
timeEstimate: 24
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define the common contract for tax bases, brackets, rates, deductions, credits, limits, phaseouts, effective dates, and citations.

## Acceptance criteria
- National, regional, and local rules can compose without flattening different tax bases.
- Rules are immutable by version and support future legislation and historical replay.
- Validation rejects gaps, overlaps, invalid thresholds, and unsupported units.

## Verification
- Express progressive, flat, gains, payroll, wealth, property, and custom taxes through the contract.

Project: [[07 Taxes Healthcare and Benefits]]
