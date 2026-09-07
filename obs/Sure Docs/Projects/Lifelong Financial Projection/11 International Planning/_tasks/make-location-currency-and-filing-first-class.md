---
pm-task: true
projectId: "p_lfp_11"
parentId: null
id: "t_lfp_1001"
title: "Make location, currency, and filing first-class"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["international", "location", "currency"]
subtaskIds: []
dependencies: ["t_lfp_403", "t_lfp_601", "t_lfp_101"]
timeEstimate: 36
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Treat residence, locality, filing system, display currency, and locale as planning facts rather than presentation-only preferences.

## Acceptance criteria
- Account and plan setup capture country, state/province, locality where supported, currency, locale, and filing status.
- A plan can override starting location and change location at a milestone with explicit effective dates and tax consequences.
- Joint and separate filing models support countries with different household taxation rules.
- International account types choose behavior from jurisdiction rules while allowing transparent custom limits and tax treatment.
- Currency conversion, real/nominal display, and tax-rule currency remain separate and correctly labeled.

## Verification
- Cross-border scenarios cover location change, currency change, local tax selection, joint/separate filing, and unsupported-country fallback.

Project: [[11 International Planning]]
