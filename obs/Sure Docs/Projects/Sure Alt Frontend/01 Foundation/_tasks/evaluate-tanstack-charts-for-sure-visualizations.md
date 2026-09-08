---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_016"
title: "Evaluate TanStack Charts for Sure visualizations"
type: "task"
status: "done"
priority: "medium"
start: "2026-09-08"
due: ""
progress: 100
assignees: []
tags: ["charts", "spike", "accessibility"]
subtaskIds: []
dependencies: ["t_alt_beta_012", "t_alt_fnd_008", "t_alt_fnd_009", "t_alt_fnd_012"]
timeEstimate: 20
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-08T04:30:00.000Z"
---

Time-box a decision on the Alpha TanStack Charts library using representative Sure financial charts, with Recharts as the fallback.

## Decision

Selected `@tanstack/charts` pinned `0.16.0` exact — see `docs/adr/0002-tanstack-charts-evaluation.md`.
Prototypes (`apps/web/src/components/charts/`), stories, suites (29 chart tests incl. SSR), and browser
evidence (94/94 incl. keyboard selection + full axe) all pass; bundle is ~29% of Recharts equivalents.

## Acceptance criteria
- Prototype responsive net-worth line/area, grouped cash-flow bars, and allocation donut charts using shared StyleX tokens.
- Test SSR/hydration, keyboard and screen-reader behavior, privacy masking, themes, localization, reduced motion, resize, and empty/negative/large datasets.
- Compare bundle cost, API stability risk, testability, visual control, and migration effort against Recharts.
- Record pass/fail criteria, exact pinned version, upgrade policy, and an ADR selecting one library.
- Expose a small application-owned chart interface so feature code does not depend broadly on Alpha internals.

## Verification
- Prototype stories and interaction tests pass; the ADR includes measured evidence and a clear fallback decision.

Project: [[01 Foundation]]
