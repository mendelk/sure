---
pm-task: true
projectId: "[[10 Estate and Charitable Planning|10 Estate and Charitable Planning]]"
parentId:
id: t_lfp_904
title: Model lifetime and estate charitable giving
type: task
status: todo
priority: medium
start: ""
due: ""
progress: 0
assignees: []
tags:
  - estate
  - charity
  - tax
subtaskIds: []
dependencies:
  - "[[model-expense-and-giving-events|Model expense and giving events]]"
  - "[[model-roth-sepp-and-tax-advantaged-strategies|Model Roth, SEPP, and tax-advantaged strategies]]"
  - "[[calculate-gross-estate-legacy-and-net-legacy|Calculate gross estate, legacy, and net legacy]]"
timeEstimate: 36
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Support ordinary gifts, Qualified Charitable Distributions, donor-advised funds, and charitable estate allocations with appropriate tax treatment.

## Acceptance criteria
- Giving events identify cash/property source, recipient type, timing, deduction treatment, carryforward, and jurisdiction.
- QCDs source eligible retirement accounts, satisfy applicable distribution requirements, and avoid incorrect taxable-income/deduction treatment.
- DAF contributions can use cash or appreciated assets and model gains, deductions, and carryforward separately.
- Estate giving allocates a percentage of net legacy from highest-tax-cost assets first while preserving the configured total split.
- Reports distinguish lifetime giving, estate giving, deductions used/carried, tax effect, heirs' amount, and net legacy.

## Verification
- Compare cash gift, appreciated-stock DAF, QCD, and charitable estate plans across itemizing and non-itemizing years.

Project: [[10 Estate and Charitable Planning]]
