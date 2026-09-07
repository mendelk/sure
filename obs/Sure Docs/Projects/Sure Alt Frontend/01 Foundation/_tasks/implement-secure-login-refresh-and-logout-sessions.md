---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_007"
title: "Implement secure login refresh and logout sessions"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["auth", "frontend", "api"]
subtaskIds: []
dependencies: ["t_alt_fnd_005", "t_alt_fnd_006"]
timeEstimate: 36
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Allow existing non-MFA users to log in and maintain a secure BFF session for the first release.

## Acceptance criteria
- Implement accessible login, invalid-credential, unavailable-server, and unsupported-MFA states.
- Store Sure tokens only in the server-managed session selected by the threat model.
- Refresh once under concurrency, rotate credentials safely, and retry an eligible request once after expiry.
- Add or extend the Rails API contract for explicit token revocation/logout if required.
- Clear local session state on logout, revocation, deactivation, invalid refresh, or deployment API incompatibility.

## Verification
- Unit and integration tests cover login, refresh rotation, concurrent expiry, logout, stale cookies, and token non-disclosure.
- Rails endpoint changes include Minitest behavior coverage, docs-only rswag specs, and regenerated OpenAPI.

Project: [[01 Foundation]]
