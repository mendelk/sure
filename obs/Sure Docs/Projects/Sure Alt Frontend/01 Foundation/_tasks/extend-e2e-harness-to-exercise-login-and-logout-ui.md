---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_020"
title: "Extend e2e harness to exercise the login and logout UI against real Rails"
type: "task"
status: "todo"
priority: "medium"
start: ""
due: ""
progress: 0
assignees: []
tags: ["testing", "auth", "frontend"]
subtaskIds: []
dependencies: ["t_alt_fnd_007", "t_alt_fnd_012"]
timeEstimate: 8
createdAt: "2026-09-08T02:10:00.000Z"
updatedAt: "2026-09-08T02:10:00.000Z"
---

Drive the real browser → BFF → Rails login and logout flows in the
Playwright smoke suite, closing the seam the t_alt_fnd_012 harness
explicitly anticipated ("the browser-side session assertion lands with
the auth UI").

## Context

The fnd-007 session layer is proven by unit tests against a mock
upstream, and the fnd-012 smoke suite asserts the SSR home and seeded
Rails logins via the API context — but no test drives the actual
`/login` and `/logout` routes through a real browser against the real
Rails test API. The browser cookie handoff (`loginAs` → session cookie →
authed page render → logout) is unexercised end to end.

## Acceptance criteria
- Smoke suite logs a seeded e2e user in through the `/login` UI in a real
  browser, asserts the post-login redirect and authenticated chrome.
- An authed browser request through the BFF carries the session cookie
  and returns seeded data (browser → BFF → Rails → database).
- Logout through the `/logout` UI clears the session: the browser lands
  signed-out and the Rails token pair is revoked.
- Invalid-credential and unavailable-server states render accessibly in
  the real browser (failure leg via Playwright route abort).
- New pages carrying PII/finance regions mark them `data-sensitive` so
  masked artifacts stay privacy-mode compliant.

## Verification
- `pnpm test:e2e:ci` stays green in CI with the new checks, and seeded
  data/process cleanup remains reliable.

Project: [[01 Foundation]]