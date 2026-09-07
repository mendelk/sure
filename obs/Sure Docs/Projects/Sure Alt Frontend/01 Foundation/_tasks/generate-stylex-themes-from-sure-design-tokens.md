---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_008"
title: "Generate StyleX themes from Sure design tokens"
type: "task"
status: "done"
priority: "high"
start: ""
due: ""
progress: 100
assignees: []
tags: ["design-system", "stylex", "tooling"]
subtaskIds: []
dependencies: ["t_alt_fnd_002"]
timeEstimate: 24
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Make `design/tokens/sure.tokens.json` the canonical source for typed StyleX variables and light/dark themes.

## Acceptance criteria
- Transform DTCG references and `sure.dark` extensions without copying a second hand-maintained palette.
- Generate typed color, typography, radius, shadow, motion, and chart tokens consumable by `apps/web/`.
- Preserve existing Rails token generation and add deterministic drift checks for both consumers.
- Define semantic StyleX usage rules and prohibit raw palette literals in product components.
- Handle reduced motion, forced colors, and system color-scheme defaults.

## Verification
- Token generation is deterministic and representative semantic tokens render correctly in light and dark Storybook stories.

Project: [[01 Foundation]]
