---
pm-task: true
projectId: "[[11 International Planning|11 International Planning]]"
parentId:
id: t_lfp_1005
title: Deliver European and global tax presets
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - international
  - tax
  - presets
subtaskIds:
  - "[[deliver-germany-and-netherlands-presets|Deliver Germany and Netherlands presets]]"
  - "[[deliver-european-tax-presets|Deliver European tax presets]]"
  - "[[deliver-asia-tax-presets|Deliver Asia tax presets]]"
  - "[[deliver-brazil-and-global-fallback|Deliver Brazil preset and global fallback]]"
dependencies:
  - "[[make-location-currency-and-filing-first-class|Make location, currency, and filing first-class]]"
  - "[[build-jurisdiction-aware-tax-engine|Build jurisdiction-aware tax engine]]"
  - "[[implement-us-income-and-payroll-taxes|Implement US income and payroll taxes]]"
  - "[[reconcile-withholding-refunds-and-tax-balances|Reconcile withholding, refunds, and tax balances]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
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
