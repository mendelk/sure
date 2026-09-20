---
pm-task: true
projectId: "[[01 Foundation|01 Foundation]]"
parentId:
id: t_alt_fnd_009
title: Build accessible UI primitives and Storybook
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - design-system
  - accessibility
  - storybook
subtaskIds: []
dependencies:
  - "[[configure-typescript-lint-formatting-and-workspace-scripts|Configure TypeScript lint formatting and workspace scripts]]"
  - "[[generate-stylex-themes-from-sure-design-tokens|Generate StyleX themes from Sure design tokens]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:37.613Z
timeEstimate: 40
---

Create the first reusable React Aria and StyleX primitives needed by authentication, navigation, forms, tables, overlays, and feedback.

## Acceptance criteria
- Cover buttons/links, fields, select/combobox, checkbox/switch, dialog/popover/menu, tabs, alert, badge, card, skeleton, empty state, and toast.
- Use React Aria behavior and semantic tokens; preserve keyboard navigation, visible focus, labeling, errors, disabled/loading states, and reduced motion.
- Add Storybook stories for variants, responsive widths, themes, long text, and failure states.
- Add automated accessibility checks and interaction tests for complex primitives.
- Document composition rules that prevent feature teams from recreating duplicate shapes.

## Verification
- Storybook builds statically and its accessibility checks pass for the included stories.

Project: [[01 Foundation]]
