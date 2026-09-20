---
pm-task: true
projectId: "p_cd_live"
parentId: null
id: "t_cd_live_008"
title: "Refine the selected first slice"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "dashboard", "checkpoint"]
subtaskIds: []
dependencies: ["t_cd_live_007"]
timeEstimate: 10
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Apply the first review's product decisions while the implementation is still intentionally local and inexpensive to reshape.

## Ownership boundary
Own the prototype page and direct helpers. Delete rejected paths rather than preserving toggles, compatibility layers, or unused abstractions.

## Acceptance criteria
- Implement every keep/change decision required for the next experiments and remove rejected UI and data fields.
- Preserve the proven core loop: edit SureQL, run against authorized real data, see results, arrange cards, and return after refresh.
- Name emerging file boundaries only where the revised code already has separate responsibilities; do not create interfaces for one implementation.
- Leave dashboard interaction, report presentation, and persistence code in identifiable file areas that the next three workers can own without shared-file edits.
- Update the starter snapshot to the accepted first-slice behavior.

## Verification
- Repeat the accepted browser walkthrough and verify discarded behavior and unused persisted fields are gone.

Project: [[01 Live UI and SureQL Loop]]
