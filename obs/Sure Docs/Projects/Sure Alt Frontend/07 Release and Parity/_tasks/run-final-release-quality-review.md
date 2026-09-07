---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_009"
title: "Run final release quality review"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["quality", "security", "release"]
subtaskIds: []
dependencies: ["t_alt_rel_008"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Run final full-product regression, threat-control verification, WCAG 2.2 AA review, browser matrix, and performance-budget audit.

## Acceptance criteria
- Test clean install, every staged upgrade, rollback, session continuity, API incompatibility, Rails outage, offline/PWA update, and role transitions.
- Execute the closed workflow matrix in latest Chrome, Firefox, Safari, and Edge coverage at desktop and phone widths.
- Re-run CSRF, XSS, SSRF, authz, token/session, secret/log/cache leakage, dependency, and container checks.
- Verify route budgets and Core Web Vitals on realistic large datasets, including privacy/theme/localization variants.
- Resolve all critical/high findings and document accepted lower-risk residuals with owners.

## Verification
- Publish a reproducible final report tied to immutable release candidates and complete CI/manual evidence.

Project: [[07 Release and Parity]]
