---
pm-project: true
id: "p_cd_live"
title: "01 Live UI and SureQL Loop"
description: "Start with working product UI, not architecture. Put an editable raw SureQL query and real results on /dashboards, then wrap it in React Grid Layout, remember it locally, seed a starter experience, add report cards, and support multiple dashboards. Keep implementation deliberately local until a browser review decides what should survive."
color: "#2563eb"
icon: "lucide-monitor-play"
taskIds:
  - "t_cd_live_001"
  - "t_cd_live_002"
  - "t_cd_live_003"
  - "t_cd_live_004"
  - "t_cd_live_005"
  - "t_cd_live_006"
  - "t_cd_live_007"
  - "t_cd_live_008"
parent: "[[Custom Dashboards]]"
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
config:
  defaultView: "table"
  autoSchedule: false
---

# lucide-monitor-play 01 Live UI and SureQL Loop

Every task changes something visible or directly usable. No general dashboard domain model, repository abstraction, renderer registry, or migration framework is created in this workstream.

## Tasks
- [x] [[build-a-live-editable-sureql-dashboard|Build a live editable SureQL dashboard]]
- [x] [[place-the-live-report-on-a-draggable-grid|Place the live report on a draggable grid]]
- [ ] [[remember-one-dashboard-in-local-storage|Remember one dashboard in local storage]]
- [ ] [[ship-a-resettable-starter-dashboard|Ship a resettable starter dashboard]]
- [ ] [[add-and-remove-live-report-cards|Add and remove live report cards]]
- [ ] [[create-and-switch-between-dashboards|Create and switch between dashboards]]
- [ ] [[review-the-first-live-dashboard-slice|Review the first live dashboard slice]]
- [ ] [[refine-the-selected-first-slice|Refine the selected first slice]]
