---
pm-task: true
projectId: "p_lfp_10"
parentId: null
id: "t_lfp_903"
title: "Estimate estate, inheritance, and settlement costs"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["estate", "tax"]
subtaskIds: []
dependencies: ["t_lfp_902", "t_lfp_601", "t_lfp_603"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Estimate jurisdiction-specific estate/inheritance tax and the practical costs of settling and liquidating an estate.

## Acceptance criteria
- Initial presets include US federal estate tax and UK inheritance tax with year-versioned exemptions and rates.
- Rules account for taxable estate composition, eligible deductions, charitable allocation, spouse treatment, and applicable exemptions.
- Tax-deferred distributions, taxable gains without step-up, real-estate sale costs, debt payoff, final income taxes, probate/legal/executor costs are distinct.
- Custom assumptions support jurisdictions without a maintained preset and remain clearly labeled estimates.
- Estate drag reports total and component reduction from legacy to net legacy.

## Verification
- Boundary tests cover exemption thresholds, charitable deductions, spouse transitions, step-up/no-step-up, and illiquid estates.

Project: [[10 Estate and Charitable Planning]]
