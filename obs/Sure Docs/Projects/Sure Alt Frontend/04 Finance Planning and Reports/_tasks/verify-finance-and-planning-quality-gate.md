---
pm-task: true
projectId: "[[04 Finance Planning and Reports|04 Finance Planning and Reports]]"
parentId:
id: t_alt_fin_017
title: Verify finance and planning quality gate
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - milestone
  - finance
  - quality
subtaskIds: []
dependencies:
  - "[[build-manual-account-forms-for-all-account-types|Build manual account forms for all account types]]"
  - "[[build-account-detail-activity-and-balance-history|Build account detail activity and balance history]]"
  - "[[implement-account-statement-workflows|Implement account statement workflows]]"
  - "[[implement-holdings-management-parity|Implement holdings management parity]]"
  - "[[implement-trade-management-ui|Implement trade management UI]]"
  - "[[implement-valuation-management-parity|Implement valuation management parity]]"
  - "[[implement-securities-and-price-history-ui|Implement securities and price history UI]]"
  - "[[implement-transfer-management-parity|Implement transfer management parity]]"
  - "[[implement-reports-and-export-tools|Implement reports and export tools]]"
  - "[[complete-category-tag-and-merchant-management|Complete category tag and merchant management]]"
  - "[[compose-plan-hub|Compose plan hub]]"
  - "[[add-frontend-ci-and-performance-budgets|Add frontend CI and performance budgets]]"
timeEstimate: 40
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-07T01:09:35.000Z
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
