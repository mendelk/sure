---
pm-task: true
projectId: "p_cd_productize"
parentId: null
id: "t_cd_product_006"
title: "Verify and trim the complete dashboard feature"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["verification", "performance", "release"]
subtaskIds: []
dependencies: ["t_cd_product_004", "t_cd_product_005"]
timeEstimate: 10
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T00:00:00.000Z"
---

Prove the selected local-first feature end to end and remove avoidable runtime and maintenance cost.

## Ownership boundary
Own final integration verification and narrow fixes. Route lane-specific defects back to their selected implementation rather than adding compensating branches.

## Acceptance criteria
- Cover first seed, raw SureQL preview/save/error, every retained presentation, report-card add/remove, dashboard create/rename/switch/delete, selected layout controls, refresh, reset, and storage recovery.
- Cover authorized real data, empty family, truncation, network failure, session expiry, two-user isolation, and cross-tab behavior.
- Cover direct URL, back/forward, accepted breakpoints, light/dark, privacy, reduced motion, zoom, pointer, and keyboard-only use.
- Confirm grid movement does not rerun reports or write localStorage for every pointer event and repeated report requests are not duplicated unnecessarily.
- Remove temporary experiment instrumentation and confirm no dashboard database migration or server persistence was introduced.

## Verification
- Exercise the actual Rails and React surface in a browser, then run focused Rails tests, SPA typecheck, changed-file lint, and production SPA build with exact outcomes.

Project: [[05 Productize the Proven Direction]]
