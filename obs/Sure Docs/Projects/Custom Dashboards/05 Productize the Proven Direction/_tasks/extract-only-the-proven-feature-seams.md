---
pm-task: true
projectId: "[[05 Productize the Proven Direction|05 Productize the Proven Direction]]"
parentId:
id: t_cd_product_003
title: Extract only the proven feature seams
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
  - "[[integrate-the-selected-dashboard-experience|Integrate the selected dashboard experience]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:36.798Z
timeEstimate: 10
---

Extract minimal boundaries only where accepted implementation now repeats or where a future storage adapter must substitute.

## Ownership boundary
Own feature-local refactoring after behavior is fixed. No new capability belongs in this task, and no interface is created for a single call site without a demonstrated substitution need.

## Acceptance criteria
- Extract a report-runner boundary around the existing authorized SureQL request only if editor and cards both consume it.
- Extract a local dashboard store boundary sufficient to substitute an in-memory adapter in the actual route; keep browser recovery/seed details private.
- Extract presentation dispatch only for the presentation kinds kept at review, with no speculative plugin system.
- Keep React Grid Layout vendor types inside the smallest grid-facing module if multiple accepted consumers otherwise depend on them.
- Delete duplicated state and direct deep imports revealed by integration while preserving the browser-observed behavior exactly.

## Verification
- Run the selected browser walkthrough before and after refactoring and render the actual route once with the in-memory store substitute.

Project: [[05 Productize the Proven Direction]]
