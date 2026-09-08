---
pm-project: true
id: "p_alt_release"
title: "07 Staged Releases and Parity"
description: "Package and publish the core accounts and transactions release first, then layer ingestion, advanced finance, automation/admin, providers, and final parity releases."
color: "#72788a"
icon: "lucide-rocket"
taskIds:
  - "t_alt_rel_001"
  - "t_alt_rel_002"
  - "t_alt_rel_003"
  - "t_alt_rel_004"
  - "t_alt_rel_005"
  - "t_alt_rel_006"
  - "t_alt_rel_007"
  - "t_alt_rel_011"
  - "t_alt_rel_008"
  - "t_alt_rel_009"
  - "t_alt_rel_010"
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

# lucide-rocket 07 Staged Releases and Parity

Package the frontend as a separate self-hosted service and publish the smallest useful product first. Every later release adds one coherent layer without expanding the core milestone retroactively.

## Tasks
- [ ] [[containerize-the-tanstack-start-frontend|Containerize the TanStack Start frontend]]
- [ ] [[integrate-the-frontend-service-with-docker-compose|Integrate the frontend service with Docker Compose]]
- [ ] [[document-self-hosted-configuration-and-operations|Document self-hosted configuration and operations]]
- [ ] [[publish-core-accounts-and-transactions-release|Publish core accounts and transactions release]]
- [ ] [[publish-ingestion-and-simplefin-release|Publish ingestion and SimpleFIN release]]
- [ ] [[publish-finance-and-planning-release|Publish finance and planning release]]
- [ ] [[publish-automation-settings-and-admin-release|Publish automation, settings, and admin release]]
- [ ] [[publish-v2-providers-release|Publish V2 providers release]]
- [ ] [[close-the-route-and-workflow-parity-matrix|Close the route and workflow parity matrix]]
- [ ] [[run-final-release-quality-review|Run final release quality review]]
- [ ] [[publish-full-web-parity-release|Publish full web parity release]]
