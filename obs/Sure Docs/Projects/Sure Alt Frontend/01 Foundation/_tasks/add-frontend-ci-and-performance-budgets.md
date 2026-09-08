---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_017"
title: "Add frontend CI and performance budgets"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["ci", "performance", "security"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_003", "t_alt_fnd_004", "t_alt_fnd_012", "t_alt_fnd_018"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Make frontend correctness, contract drift, security, accessibility, and explicit performance budgets required CI checks.

## Acceptance criteria
- Add pnpm install, generated-code drift, typecheck, lint, format, unit/component, Storybook, and Playwright jobs with useful caching.
- Add dependency/license audit and secret/client-bundle scans appropriate for an AGPL self-hosted app.
- Define route-level budgets for compressed initial JavaScript/CSS, request count, image weight, LCP, INP, and CLS on desktop and mobile fixtures.
- Fail regressions beyond an explicitly documented tolerance; do not use a single aggregate score as the only gate.
- Publish actionable traces/reports while masking sensitive fixtures.

## Verification
- The workflow passes on a clean branch and fails on deliberate generated-code, accessibility, test, and bundle-budget regressions.

Project: [[01 Foundation]]
