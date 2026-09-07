---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_001"
title: "Audit web parity surface and API gap matrix"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["discovery", "api", "parity"]
subtaskIds: []
dependencies: []
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Create the authoritative route-and-workflow matrix for self-hosted Sure, including super-admin surfaces and excluding hosted billing and native-client work.

## Acceptance criteria
- Inventory authenticated, unauthenticated, settings, provider, onboarding, PWA, and `admin` workflows from `config/routes.rb`, controllers, views, and system tests.
- Map every workflow to an existing OpenAPI operation, a required API extension, or an explicit exclusion with rationale.
- Record roles, empty/loading/error states, uploads/downloads, redirects, polling, and destructive confirmations.
- Store the matrix in version-controlled project documentation and link every implementation row to a task ID in this program.
- Flag gaps in the task graph rather than silently broadening another task.

## Verification
- A reviewer can account for every non-billing browser route and every existing system test in the matrix.
- No supported row depends on rendering or redirecting to Rails HTML.

Project: [[01 Foundation]]
