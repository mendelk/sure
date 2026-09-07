---
pm-task: true
projectId: "p_lfp_01"
parentId: null
id: "t_lfp_005"
title: "Define financial-planning safety and explainability"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["safety", "explainability"]
subtaskIds: []
dependencies: ["t_lfp_003", "t_lfp_004"]
timeEstimate: 16
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Define how Sure communicates assumptions, uncertainty, stale rules, unsupported cases, and calculation limitations while targeting planning-grade estimates rather than tax-filing precision or individualized financial advice.

## Acceptance criteria
- Material outputs can be traced to inputs, rules, and simulated ledger entries.
- Contextual warnings cover implausible values, early withdrawal penalties, unmet milestones, liquidity failures, tax-rule gaps, bankruptcy, and stale projections.
- Estimates are labeled by confidence and jurisdiction coverage; unsupported behavior fails visibly rather than falling back silently.
- Educational explanations distinguish tax liability from withholding, nominal from real values, deterministic from probabilistic outcomes, and likelihood from guarantee.
- Tax and benefit outputs disclose approximation boundaries and never imply that Sure can prepare, file, or replace an official tax return.
- User exports include assumptions, ruleset versions, warnings, and an informational-use disclaimer.

## Verification
- Domain review confirms that a non-expert can explain why a representative result changed and which assumptions remain uncertain.

Project: [[01 Product Definition and Architecture]]
