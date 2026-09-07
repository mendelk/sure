---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_006"
title: "Threat-model browser authentication and BFF"
type: "task"
status: "done"
priority: "critical"
start: ""
due: ""
progress: 100
assignees: []
tags: ["security", "architecture", "auth"]
subtaskIds: []
dependencies: []
timeEstimate: 16
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Document the security architecture for browser sessions backed by Sure OAuth access and refresh tokens.

## Acceptance criteria
- Model login, refresh rotation, logout/revocation, expiry, concurrent refresh, account deactivation, and role changes.
- Decide encrypted server-side session storage and cookie attributes without exposing Sure tokens to browser JavaScript.
- Cover CSRF, XSS, SSRF, session fixation, replay, open redirects, log leakage, cache leakage, and secret rotation.
- Define trust boundaries for the public frontend container, internal Rails API, reverse proxy, browser, and third-party provider redirects.
- Produce an ADR with implementation requirements and testable release controls.

## Verification
- Security-sensitive foundation tasks cite the approved controls and have no unresolved critical threat.

Project: [[01 Foundation]]
