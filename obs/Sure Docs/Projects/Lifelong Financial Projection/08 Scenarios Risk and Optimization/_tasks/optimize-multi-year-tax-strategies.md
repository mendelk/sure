---
pm-task: true
projectId: "[[08 Scenarios Risk and Optimization|08 Scenarios Risk and Optimization]]"
parentId:
id: t_lfp_705
title: Optimize multi-year tax strategies
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - optimization
  - tax
  - strategies
subtaskIds:
  - "[[define-tax-optimization-objectives-and-constraints|Define tax-optimization objectives and constraints]]"
  - "[[generate-and-evaluate-tax-strategy-candidates|Generate and evaluate tax-strategy candidates]]"
  - "[[compare-and-apply-optimized-tax-strategies|Compare and apply optimized tax strategies]]"
dependencies:
  - "[[model-roth-sepp-and-tax-advantaged-strategies|Model Roth, SEPP, and tax-advantaged strategies]]"
  - "[[estimate-social-security-pensions-and-medicare|Estimate Social Security, pensions, and Medicare]]"
  - "[[estimate-aca-coverage-and-subsidies|Estimate ACA coverage and subsidies]]"
  - "[[define-and-analyze-chance-of-success|Define and analyze chance of success]]"
timeEstimate:
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Search combinations of Roth conversions, capital-gain harvesting, and withdrawal shielding against user-defined tax and outcome objectives.

## Acceptance criteria
- Strategies can target a federal bracket, IRMAA cliff, ACA/FPL limit, taxable-income or MAGI threshold, and optional ceilings/constraints.
- Opportunistic actions respect account availability, basis, contribution/conversion restrictions, income ownership, filing status, and liquidity.
- Withdrawal shielding shifts marginal withdrawals to eligible tax-free sources after a target is reached.
- Optimization can maximize net worth/net legacy or minimize lifetime taxes, estate drag, premiums, or another supported metric.
- Results compare common/custom strategies, expose target interactions over time, explain tradeoffs, and apply a chosen strategy as a reviewable plan change.

## Verification
- Benchmark strategies around bracket, IRMAA, and ACA cliffs and verify the optimizer never violates configured constraints.

Project: [[08 Scenarios Risk and Optimization]]
