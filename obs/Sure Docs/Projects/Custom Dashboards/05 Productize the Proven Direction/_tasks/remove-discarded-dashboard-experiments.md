---
pm-task: true
projectId: "p_cd_productize"
parentId: null
id: "t_cd_product_001"
title: "Remove discarded dashboard experiments"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "cleanup", "productization"]
subtaskIds: []
dependencies: ["t_cd_interact_005", "t_cd_present_005", "t_cd_persist_006"]
timeEstimate: 8
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Start productization by deleting every interaction and presentation path rejected at the review checkpoints.

## Ownership boundary
Own coordinated cleanup across the three accepted lanes. Remove obsolete components, state fields, styles, branches, tests, and seed values; do not preserve hidden toggles or compatibility aliases.

## Acceptance criteria
- Apply all keep/change/delete decisions from the live, interaction, and report reviews.
- Delete rejected edit surfaces, layout strategies, presentation choices, and their persisted fields.
- Update current seed data and local snapshot validation to the selected behavior through the persistence lane's established version mechanism.
- Keep the accepted SureQL, dashboard, grid, and reset flows operating after cleanup.
- Leave no unused exports or comments describing experiments that no longer exist.

## Verification
- Repeat the selected browser flows and search the feature module for rejected component names, flags, and obsolete persisted keys.

Project: [[05 Productize the Proven Direction]]
