---
pm-task: true
projectId: "p_lfp_11"
parentId: null
id: "t_lfp_1006"
title: "Operate a versioned annual rules-update program"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["international", "tax", "operations"]
subtaskIds: []
dependencies: ["t_lfp_1002", "t_lfp_1003", "t_lfp_1004", "t_lfp_1005", "t_lfp_004"]
timeEstimate: 32
createdAt: "2026-09-07T12:00:00.000Z"
updatedAt: "2026-09-07T12:00:00.000Z"
---

Create a recurring process for updating tax tables, contribution limits, benefits, exemptions, legislation sunsets, and historical market data.

## Acceptance criteria
- Every ruleset records jurisdiction, tax year, source citations, review status, effective dates, and superseded version.
- Annual updates can coexist with prior years and never rewrite old reproducible results.
- Legislation with future sunsets or optional assumptions can be modeled explicitly rather than overwritten each year.
- Validation detects bracket gaps/overlaps, invalid phaseouts, missing currencies, and incompatible account limits.
- Users receive clear stale-rules warnings and can choose whether to rerun plans with newer rules.

## Verification
- Dry-run one full annual update across US and each initial international preset, including historical-data extension.

Project: [[11 International Planning]]
