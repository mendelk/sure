---
pm-task: true
projectId: "p_alt_release"
parentId: null
id: "t_alt_rel_008"
title: "Close the route and workflow parity matrix"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["parity", "audit", "release"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_rel_011"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Re-audit the current Rails application and prove every in-scope browser workflow has alternate-route, API-contract, and test evidence.

## Acceptance criteria
- Re-inventory routes/controllers/views/system tests and provider registry at current HEAD, not the original audit snapshot.
- Mark each row implemented with route, OpenAPI operation, role/capability, automated/manual evidence, and staged release.
- Allow exclusions only for hosted billing and native client integration, with explicit rationale.
- Create and complete blocker tasks for every newly discovered or changed in-scope workflow.
- Prove no supported flow renders, embeds, or redirects to Rails HTML except required third-party OAuth navigation.

## Verification
- Two-way checks find no unrepresented Rails route/system test and no alternate product route lacking a contract/matrix row.

Project: [[07 Release and Parity]]
