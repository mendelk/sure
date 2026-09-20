---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_003
title: Extract only proven planning seams
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - architecture
  - refactor
  - productization
subtaskIds: []
dependencies:
  - "[[integrate-the-selected-planning-experience|Integrate the selected planning experience]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:57.209Z
timeEstimate: 14
---

Extract minimal domain, calculation, rule, and storage boundaries only where accepted implementation now repeats or must substitute.

## Ownership boundary
Refactor after behavior is fixed. No new capability, speculative plugin system, or interface for a single call site.

## Acceptance criteria
- Separate current-finance snapshot input from editable plan input at the proven integration boundary.
- Extract calculation stages and rule-data access only where multiple accepted features require substitution or composition.
- Expose a local plan-store contract sufficient for in-memory and localStorage adapters used by the actual product.
- Keep country-specific, UI-specific, and calculation-specific details concrete when no repeated seam exists.

## Verification
- Run the accepted walkthrough before and after refactoring and execute the actual product once with the in-memory plan store.

Project: [[07 Productize the Proven Direction]]
