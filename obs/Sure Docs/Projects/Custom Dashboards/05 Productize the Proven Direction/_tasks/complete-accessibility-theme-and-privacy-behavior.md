---
pm-task: true
projectId: "[[05 Productize the Proven Direction|05 Productize the Proven Direction]]"
parentId:
id: t_cd_product_004
title: Complete accessibility, theme, and privacy behavior
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - frontend
  - accessibility
  - design-system
subtaskIds: []
dependencies:
  - "[[integrate-the-selected-dashboard-experience|Integrate the selected dashboard experience]]"
timeEstimate: 10
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T00:00:00.000Z
---

Finish cross-cutting behavior on the selected UI rather than polishing discarded experiments.

## Ownership boundary
Own feature composition and accepted component styling using existing Sure design tokens. Do not add global styles or change the design system without permission.

## Acceptance criteria
- Provide logical headings, landmarks, labels, focus order, dialog behavior, status announcements, and keyboard alternatives for every selected dashboard action.
- Apply existing light/dark theme tokens and privacy-mode behavior to report values, previews, and optional generated SQL without hiding labels or controls.
- Honor reduced motion and 200 percent zoom and prevent page-level horizontal overflow.
- Keep report content available when one query or presentation fails.
- Verify the selected desktop, sidebar, tablet, and phone behavior from the interaction review.

## Verification
- Browser and accessibility review covers seeded, empty, loading, error, editing, storage-warning, dark, privacy, reduced-motion, zoomed, and phone states.

Project: [[05 Productize the Proven Direction]]
