---
pm-task: true
projectId: "[[06 Estate International and Portability Experiments|06 Estate International and Portability Experiments]]"
parentId:
id: "t_lfp_global_003"
title: "Make location, currency, and filing visible plan inputs"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["international", "currency", "tax"]
subtaskIds: []
dependencies: ["[[estimate-estate,-legacy,-and-charitable-outcomes|Estimate estate, legacy, and charitable outcomes]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:56.228Z"
timeEstimate: 8
---

Prepare the working plan for country presets through user-visible inputs rather than a speculative global rules hierarchy.

## Ownership boundary
Add local plan inputs and result labels needed by the first non-US preset; preserve manual fallback behavior.

## Acceptance criteria
- Represent residence, tax jurisdiction, household filing basis, plan currency, and dated location changes.
- Keep source currencies and conversion assumptions visible throughout account, flow, tax, and result views.
- Select rules by explicit plan input rather than browser locale.
- Allow a transparent manual tax and benefit fallback when no maintained preset exists.

## Verification
- Move a reference household between currencies and jurisdictions and inspect the dated rule and conversion changes.

Project: [[06 Estate International and Portability Experiments|06 Estate International and Portability Experiments]]