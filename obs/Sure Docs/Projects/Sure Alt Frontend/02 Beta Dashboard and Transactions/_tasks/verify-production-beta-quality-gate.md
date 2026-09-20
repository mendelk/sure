---
pm-task: true
projectId: "[[02 Beta Dashboard and Transactions|02 Beta Dashboard and Transactions]]"
parentId:
id: t_alt_beta_012
title: Verify production beta quality gate
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - milestone
  - beta
  - quality
subtaskIds: []
dependencies:
  - "[[harden-beta-offline-error-and-session-behavior|Harden beta offline error and session behavior]]"
  - "[[enforce-sure-api-compatibility-checks|Enforce Sure API compatibility checks]]"
  - "[[add-frontend-ci-and-performance-budgets|Add frontend CI and performance budgets]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:42.198Z
timeEstimate: 32
---

Prove the login, dashboard, transactions, sync, and PWA slice meets the agreed production-beta definition of done.

## Acceptance criteria
- Execute the workflow-matrix rows assigned to beta against a clean Rails test environment and realistic seeded data.
- Pass WCAG 2.2 AA checks, modern evergreen browser coverage, responsive review, security controls, and defined performance budgets.
- Verify no Rails HTML fallback, browser-visible Sure token, unmasked sensitive artifact, undocumented API change, or generated-contract drift.
- Record known non-beta parity gaps as linked tasks, not undocumented caveats.
- Produce a signed-off beta test report with exact versions and evidence links.

## Verification
- All required CI checks and the documented manual checks pass with no critical/high unresolved defect.

Project: [[02 Beta Dashboard and Transactions]]
