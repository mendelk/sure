---
pm-project: true
id: "p_alt_ingestion"
title: "03 Imports and Connected Accounts"
description: "After the core milestone, add import/export workflows, provider management, sync visibility, and SimpleFIN without falling back to Rails HTML. Other providers remain deferred."
color: "#d18b47"
icon: "lucide-cloud-download"
taskIds:
  - "t_alt_ing_001"
  - "t_alt_ing_002"
  - "t_alt_ing_003"
  - "t_alt_ing_004"
  - "t_alt_ing_007"
  - "t_alt_beta_009"
  - "t_alt_ing_014"
  - "t_alt_ing_015"
  - "t_alt_ing_016"
  - "t_alt_ing_017"
  - "t_alt_ing_018"
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

# lucide-cloud-download 03 Imports and Connected Accounts

Build on the proven manual-account workflow with imports, exports, provider management, sync visibility, and SimpleFIN. This epic starts only after the core accounts and transactions quality gate.

## Tasks
- [ ] [[inventory-provider-connection-state-machines|Inventory provider connection state machines]]
- [ ] [[add-provider-management-api|Add provider management API]]
- [ ] [[build-provider-catalog-and-settings-ui|Build provider catalog and settings UI]]
- [ ] [[define-reusable-provider-connection-api-contract|Define reusable provider connection API contract]]
- [ ] [[implement-simplefin-connection|Implement SimpleFIN connection]]
- [ ] [[implement-sync-trigger-and-progress-ui|Implement sync trigger and progress UI]]
- [ ] [[complete-import-session-api|Complete import session API]]
- [ ] [[build-resumable-import-wizard|Build resumable import wizard]]
- [ ] [[complete-family-export-lifecycle-api|Complete family export lifecycle API]]
- [ ] [[build-family-export-ui|Build family export UI]]
- [ ] [[verify-ingestion-and-simplefin-quality-gate|Verify ingestion and SimpleFIN quality gate]]
