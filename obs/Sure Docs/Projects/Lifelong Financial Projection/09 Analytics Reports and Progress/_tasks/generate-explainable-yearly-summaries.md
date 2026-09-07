---
pm-task: true
projectId: "p_lfp_09"
parentId: "t_lfp_801"
id: "t_lfp_801_2"
title: "Generate explainable yearly summaries"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["analytics", "yearly-summary"]
subtaskIds: []
dependencies: ["t_lfp_801_1"]
timeEstimate: 28
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Generate one structured summary per period with starting/ending balances, metrics, line items, events, milestones, and warnings.

## Acceptance criteria
- Summary values reconcile to ledger entries and canonical metric definitions.
- Line items retain person, account, event, flow, category, and jurisdiction context.
- API consumers can traverse from a summary metric to contributing entries and rules.

## Verification
- Reconcile representative accumulation, retirement, tax-conversion, and estate years.

Project: [[09 Analytics Reports and Progress]]
