---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_019"
title: "Guarantee upstream token revocation when BFF access token is expired"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["auth", "backend", "security"]
subtaskIds: []
dependencies: ["t_alt_fnd_007"]
timeEstimate: 8
createdAt: "2026-09-08T02:10:00.000Z"
updatedAt: "2026-09-08T02:10:00.000Z"
---

Guarantee the Sure token pair is revoked upstream at logout even when the
BFF's stored access token has already expired.

## Context

Review of t_alt_fnd_007 found: Rails `POST /api/v1/auth/logout` sits
behind `authenticate_request!`, so the BFF's revocation call 401s whenever
its bearer is expired (common after idle timeout). The best-effort catch
in `logoutOfBffSession` swallows the 401, so the `refresh_token`-based
revoke branch in the controller is unreachable for exactly the sessions
most likely to need it. The refresh-token family then lives on upstream
until natural expiry, weakening the "token pair cannot outlive the
browser session" intent of ADR-0001 §3.3 / REQ-API-01.

## Acceptance criteria
- The BFF logout path revokes the token pair upstream even when its
  stored access token is expired (e.g. accept an unauthenticated logout
  carrying a valid `refresh_token` — possession of the secret proves
  authority — or have the BFF refresh-then-revoke at logout).
- Revocation-by-`refresh_token` stays idempotent and does not oracle token
  validity (unknown identifiers still return `revoked: true`).
- An unauthenticated revoke-by-refresh path cannot be used to enumerate
  or brute-force valid refresh tokens (rate-limit it like the login path).

## Verification
- Rails: Minitest coverage for revoke-by-refresh-token without a bearer;
  idempotency on unknown/already-revoked tokens; rate limiting.
- Web: session-layer test proving an expired-access-token logout still
  triggers exactly one upstream revocation call.
- rswag stays docs-only; regenerate OpenAPI if the contract changes.

Project: [[01 Foundation]]