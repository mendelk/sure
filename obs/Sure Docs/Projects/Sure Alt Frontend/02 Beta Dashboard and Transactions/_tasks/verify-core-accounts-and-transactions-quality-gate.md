---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_012"
title: "Verify core accounts and transactions quality gate"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["milestone", "core", "quality"]
subtaskIds: []
dependencies: ["t_alt_beta_011", "t_alt_fnd_011", "t_alt_fnd_015"]
timeEstimate: 32
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

Prove the login, manual account management, account navigation, and everyday transaction workflows form a complete usable core before post-core scope begins.

## Acceptance criteria
- Execute the workflow-matrix rows for manual accounts and transaction management against a clean Rails test environment and realistic seeded data.
- Pass WCAG 2.2 AA checks, modern evergreen browser coverage, responsive review, security controls, and defined performance budgets.
- Verify no Rails HTML fallback, browser-visible Sure token, unmasked sensitive artifact, undocumented API change, or generated-contract drift.
- Record dashboard, chart, sync, provider, import, report, planning, automation, and parity gaps as linked post-core tasks, not undocumented caveats.
- Produce a signed-off core milestone report with exact versions and evidence links.

## Verification
- All required CI checks and the documented manual checks pass with no critical/high unresolved defect.

Project: [[02 Beta Dashboard and Transactions]]
