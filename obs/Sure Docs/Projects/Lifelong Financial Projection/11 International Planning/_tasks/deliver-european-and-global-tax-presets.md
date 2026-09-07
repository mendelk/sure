---
pm-task: true
projectId: "p_lfp_11"
parentId: null
id: "t_lfp_1005"
title: "Deliver European and global tax presets"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["international", "tax", "presets"]
subtaskIds: ["t_lfp_1005_1", "t_lfp_1005_2", "t_lfp_1005_3", "t_lfp_1005_4"]
dependencies: ["t_lfp_1001", "t_lfp_601", "t_lfp_602", "t_lfp_604"]
timeEstimate: null
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Expand maintained presets across the approved international coverage while preserving explicit fidelity boundaries.

## Acceptance criteria
- Initial maintained presets cover Germany, Netherlands, Switzerland, Singapore, China, Hong Kong, Spain, Brazil, Norway, Belgium, and Israel.
- Each preset documents supported income, capital gains, dividends, wealth/net-worth tax, transaction tax, deductions/allowances, filing, and account types.
- Netherlands support includes Box 3 deemed returns and asset categories.
- Country-specific account and tax behavior is data/ruleset versioned rather than embedded as untraceable generic assumptions.
- Unsupported taxes or benefits are clearly identified and can be represented through custom rates/brackets/events.

## Verification
- A country-by-country reference suite checks published examples and records known gaps rather than treating partial presets as complete.

Project: [[11 International Planning]]
