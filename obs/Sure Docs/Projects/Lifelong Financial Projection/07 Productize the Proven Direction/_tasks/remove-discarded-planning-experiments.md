---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_001
title: Remove discarded planning experiments
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - cleanup
  - productization
  - checkpoint
subtaskIds: []
dependencies:
  - "[[review-and-select-estate-international-and-portability|Review and select estate, international, and portability behavior]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:54.341Z
timeEstimate: 10
---

Delete every experiment rejected by the phase reviews before integration makes it expensive to remove.

## Ownership boundary
Own removal of rejected UI, calculations, rule data, local fields, flags, and dead paths. Preserve accepted browser behavior.

## Acceptance criteria
- Translate every phase review into an explicit keep, change, or delete list.
- Delete rejected alternatives rather than leaving dormant modes or compatibility aliases.
- Remove local payload fields and transformations used only by discarded behavior.
- Keep imports explicit when an old local payload can no longer represent the selected product.

## Verification
- Run the accepted end-to-end walkthrough and confirm no rejected control, result, field, or route remains.

Project: [[07 Productize the Proven Direction]]
