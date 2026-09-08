---
pm-task: true
projectId: "p_alt_finance"
parentId: null
id: "t_alt_fin_017"
title: "Verify finance and planning quality gate"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestone", "finance", "quality"]
subtaskIds: []
dependencies: ["t_alt_beta_001", "t_alt_beta_003", "t_alt_beta_008", "t_alt_beta_010", "t_alt_fin_003", "t_alt_fin_004", "t_alt_fin_005", "t_alt_fin_006", "t_alt_fin_007", "t_alt_fin_008", "t_alt_fin_009", "t_alt_fin_010", "t_alt_fin_011", "t_alt_fin_016", "t_alt_fin_018", "t_alt_fnd_017"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Verify accounts, investments, transfers, reports, classification, budgets, goals, and planning satisfy their parity rows and release gates.

## Acceptance criteria
- Execute representative manual/provider/shared account and multi-currency workflows against real Rails data.
- Reconcile balances, holdings, trades, valuations, transfers, reports, budgets, and goals with backend-authoritative calculations.
- Pass WCAG 2.2 AA, responsive evergreen browsers, privacy/theme/i18n states, contract drift, security, and performance budgets.
- Confirm every destructive action has role enforcement, confirmation, recoverable errors, and focused cache invalidation.
- Update the parity matrix with evidence and linked defects.

## Verification
- No required finance/planning row or critical/high defect remains open.

Project: [[04 Finance Planning and Reports]]
