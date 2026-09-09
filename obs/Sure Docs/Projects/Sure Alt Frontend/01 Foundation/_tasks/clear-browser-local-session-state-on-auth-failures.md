---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_021"
title: "Clear browser local session state on api-mismatch and auth failures in real pages"
type: "task"
status: "done"
priority: "low"
start: ""
due: ""
progress: 100
assignees: []
tags: ["auth", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fnd_007"]
timeEstimate: 4
createdAt: "2026-09-08T02:10:00.000Z"
updatedAt: "2026-09-08T02:10:00.000Z"
---

Wire `clearLocalSessionState` into real authed consumers so the
documented clearing rule actually runs: local session state is cleared on
logout, revocation, deactivation, invalid refresh, and deployment API
incompatibility.

## Context

The fnd-007 browser client (`apps/web/src/lib/bff-auth-client.ts`)
documents that every session-ending outcome routes through
`clearLocalSessionState`, and the unit tests cover the function itself —
but no authed page/query consumer exists yet, so the api-mismatch →
clear-local-state path is asserted only in comments. Additionally, the
logout server function has no same-origin guard of its own (the guard
runs only inside the best-effort proxy); adding a
`checkBffMutationGuards` call there would make forced-logout uniform
with other mutations.

## Acceptance criteria
- The first authed route/query that consumes `BFF_SESSION_QUERY_KEY`
  clears local session state when a proxied call returns `api-mismatch`,
  `logged-out`, `deactivated`, or `session-expired`.
- The logout server function enforces the same mutation guards
  (origin + CSRF binding) as other session-authenticated mutations.
- Component/route tests cover the clearing path per failure code.

## Verification
- Unit tests: each failure code clears the query entry and renders the
  signed-out state; logout rejects cross-origin requests.

Project: [[01 Foundation]]