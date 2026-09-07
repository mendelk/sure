---
pm-task: true
projectId: "p_lfp_02"
parentId: null
id: "t_lfp_102"
title: "Complete planning account taxonomy"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "baseline"]
subtaskIds: []
dependencies: ["t_lfp_003"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Map Sure accounts to planning behavior and add missing financial account types needed for lifelong projections.

## Acceptance criteria
- Taxable cash, brokerage, crypto, real assets, consumer debt, mortgages, and other assets/liabilities map cleanly from existing Sure accounts.
- US support includes Traditional/Roth IRA, inherited IRA, 401k, 403b, 401a, 457b, Roth variants, HSA, and 529.
- International extensibility covers country-specific taxable, tax-deferred, tax-free, pension, education, and offset accounts.
- Account type defines contribution rules, withdrawal taxation, early-access restrictions, RMD behavior, dividend/bond treatment, liquidity, and estate treatment.
- Users can override planning classification without corrupting the factual account subtype used elsewhere in Sure.

## Verification
- A published account behavior matrix has no unclassified Sure account subtype and covers every account family required by the approved capability inventory.

Project: [[02 Household and Current Finances]]
