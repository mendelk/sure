---
pm-task: true
projectId: "p_lfp_09"
parentId: "t_lfp_803"
id: "t_lfp_803_2"
title: "Calculate effective marginal tax brackets"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "tax", "marginal-rate"]
subtaskIds: []
dependencies: ["t_lfp_803_1"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Calculate the combined marginal effect of an additional dollar of each supported income type.

## Acceptance criteria
- Effective rates include interacting federal, state/local, payroll, gains, phaseout, ACA, and IRMAA effects where applicable.
- Bracket boundaries and source-specific rates remain explainable from underlying rules.
- Income-by-rate analysis accounts for the amount of income in each effective band.

## Verification
- Probe immediately below and above every modeled bracket, phaseout, and cliff boundary.

Project: [[09 Analytics Reports and Progress]]
