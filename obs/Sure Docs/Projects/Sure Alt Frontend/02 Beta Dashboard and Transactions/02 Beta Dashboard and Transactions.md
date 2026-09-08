---
pm-project: true
id: "p_alt_beta"
title: "02 Core Accounts and Transactions"
description: "Deliver the first usable financial slice: manual account management, account navigation, transaction browsing, transaction CRUD, and basic classification without waiting for dashboards, charts, providers, imports, or reports."
color: "#4d9d8d"
icon: "lucide-layout-dashboard"
taskIds:
  - "t_alt_fin_001"
  - "t_alt_fin_002"
  - "t_alt_beta_002"
  - "t_alt_beta_004"
  - "t_alt_beta_005"
  - "t_alt_beta_006"
  - "t_alt_beta_007"
  - "t_alt_beta_011"
  - "t_alt_beta_012"
parent: "[[Sure Alt Frontend]]"
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
config:
  defaultView: "table"
  autoSchedule: false
---

# lucide-layout-dashboard 02 Core Accounts and Transactions

Deliver the first usable financial slice for existing users. A user can manage manual accounts and complete everyday transaction workflows before any dashboard, chart, provider, import, report, or planning work begins.

## Core sequence

- [ ] [[complete-account-management-api|Complete core manual account API]]
- [ ] [[build-manual-account-forms-for-all-account-types|Build core manual account forms]]
- [ ] [[implement-account-summary-navigation|Implement account summary navigation]]
- [ ] [[complete-transaction-list-contract|Complete core transaction list contract]]
- [ ] [[build-transaction-browsing-route|Build transaction browsing route]]
- [ ] [[implement-transaction-create-edit-and-delete|Implement transaction create, edit, and delete]]
- [ ] [[implement-transaction-category-tag-and-merchant-editing|Implement transaction category editing]]
- [ ] [[harden-core-account-and-transaction-behavior|Harden core account and transaction behavior]]
- [ ] [[verify-core-accounts-and-transactions-quality-gate|Verify core accounts and transactions quality gate]]

## Core exit criteria

- A signed-in user can create, edit, disable, and delete supported manual account types.
- A signed-in user can browse, search, create, edit, delete, and categorize transactions.
- URLs, validation, authorization, privacy, error recovery, desktop/mobile layouts, and generated API contracts are verified end to end.
- Advanced account settings/sharing, tags, merchants, dashboard composition, trends, transaction splits, sync, imports, providers, reports, and planning remain explicit post-core work.
