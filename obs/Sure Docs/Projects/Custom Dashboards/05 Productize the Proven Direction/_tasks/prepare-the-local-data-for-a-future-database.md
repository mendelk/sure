---
pm-task: true
projectId: "[[05 Productize the Proven Direction|05 Productize the Proven Direction]]"
parentId:
id: t_cd_product_005
title: Prepare the local data for a future database
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - storage
  - database-handoff
  - architecture
subtaskIds: []
dependencies:
  - "[[extract-only-the-proven-feature-seams|Extract only the proven feature seams]]"
  - "[[verify-the-local-persistence-lifecycle|Verify the local persistence lifecycle]]"
timeEstimate: 8
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Make the proven local data replaceable later without choosing database tables before product behavior settles further.

## Ownership boundary
Own adapter-neutral store behavior and a bounded handoff mapping. Do not add migrations, Active Record models, persistence API endpoints, dual writes, or synchronization.

## Acceptance criteria
- Keep current-user ownership supplied by authenticated store construction rather than trusting mutable owner data in local snapshots.
- Expose only the create/read/update/delete and subscription behavior the accepted route actually uses.
- Define atomic update and revision-conflict outcomes a future server adapter can implement.
- Run the same observable store checks against localStorage and the in-memory substitute.
- Record proven records, relationships, ownership, and integrity constraints while explicitly leaving table design and sharing behavior to the future database project.

## Verification
- Switch the actual route between localStorage and in-memory stores at composition without changing dashboard, grid, editor, or presentation components.

Project: [[05 Productize the Proven Direction]]
