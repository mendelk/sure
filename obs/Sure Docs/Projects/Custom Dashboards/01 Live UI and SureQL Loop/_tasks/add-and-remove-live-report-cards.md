---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_005
title: Add and remove live report cards
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - frontend
  - reports
  - walking-slice
subtaskIds: []
dependencies:
  - "[[ship-a-resettable-starter-dashboard|Ship a resettable starter dashboard]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:32.080Z
timeEstimate: 10
---

Learn how multiple reports should feel by duplicating the proven live card before designing report entities.

## Ownership boundary
Own the first page's report-card list and grid items. Keep cards as a plain persisted array local to the prototype; do not extract a registry or shared report model.

## Acceptance criteria
- Add a report card with a generated stable ID, editable title, starter SureQL, table result, and collision-free default grid position.
- Run and save each card independently while deduplicating only exact repeated requests within the same card.
- Remove a card after confirmation without altering other cards or layouts.
- Persist the card array and grid positions in the existing current-user snapshot.
- Keep one failed query isolated so other report cards remain visible and usable.

## Verification
- Create two report cards, run different real queries, move them, remove one, refresh, and confirm the surviving card and layout.

Project: [[01 Live UI and SureQL Loop]]
