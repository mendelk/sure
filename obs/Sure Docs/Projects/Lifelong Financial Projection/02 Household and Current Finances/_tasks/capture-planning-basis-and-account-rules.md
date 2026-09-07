---
pm-task: true
projectId: "p_lfp_02"
parentId: null
id: "t_lfp_103"
title: "Capture planning basis and account rules"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["accounts", "tax", "baseline"]
subtaskIds: []
dependencies: ["t_lfp_102"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Capture account-level planning facts not derivable from balance history or holdings.

## Acceptance criteria
- Inputs include cost basis, after-tax contributions, prior-year contributions/distributions, restricted conversions, contribution room, withdrawal withholding, and early-access age.
- Investment accounts support custom growth/dividend assumptions, reinvestment windows, annual fees, passive-income inclusion, bond location, and Monte Carlo fixed/variable treatment.
- Real assets support purchase basis, ownership, assessed value, property tax basis, financing links, income generation, sale exclusions, liquidation costs, and auto-liquidation preference.
- Mortgages can link offset accounts and loans retain payment, APR, term, forgiveness, and plan-level override data.
- Missing or estimated values are visibly distinguished from provider-backed facts.

## Verification
- Account starting conditions reconcile to Sure's current balance sheet while retaining all planning-only metadata across syncs.

Project: [[02 Household and Current Finances]]
