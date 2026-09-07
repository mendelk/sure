---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_015"
title: "Enforce Sure API compatibility checks"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["api", "compatibility", "operations"]
subtaskIds: []
dependencies: ["t_alt_fnd_004", "t_alt_fnd_005", "t_alt_fnd_018"]
timeEstimate: 20
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Give the BFF a reliable way to reject an incompatible Sure API before users encounter arbitrary request failures.

## Acceptance criteria
- Add documented API metadata/version/capability information to Rails if the current contract cannot provide it.
- Define the frontend's supported contract range and check it at readiness and session establishment.
- Distinguish unreachable, unauthenticated, too old, too new, and missing-capability states with actionable messages.
- Keep compatibility decisions server-side and avoid leaking internal API origins.
- Update generated OpenAPI artifacts and deployment documentation.

## Verification
- Tests cover compatible and incompatible versions/capabilities and ensure readiness reports the correct state.

Project: [[01 Foundation]]
