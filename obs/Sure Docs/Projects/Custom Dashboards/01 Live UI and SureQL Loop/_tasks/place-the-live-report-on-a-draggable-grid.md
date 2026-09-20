---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_002
title: Place the live report on a draggable grid
type: task
status: done
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - frontend
  - grid
  - walking-slice
subtaskIds: []
dependencies:
  - "[[build-a-live-editable-sureql-dashboard|Build a live editable SureQL dashboard]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:27.629Z
timeEstimate: 8
---

Put the working SureQL report inside React Grid Layout so dashboard composition can be felt before its model is designed.

## Ownership boundary
Own the first dashboard page and its local grid component. Use React Grid Layout v2 directly in this prototype; do not build a wrapper or reusable layout API yet.

## Acceptance criteria
- Add a compatible React Grid Layout v2 dependency and required vendor CSS without modifying Sure design-system styles.
- Render the report as one draggable and resizable card with a dedicated drag handle and minimum usable dimensions.
- Keep query editing, Run, table scrolling, and buttons interactive without accidentally initiating drag.
- Measure the available container width and update position/size in page-local state after drag or resize stops.
- Demonstrate view behavior at desktop and phone widths without committing a responsive layout strategy yet.

## Verification
- In the browser, drag and resize the live report, edit and rerun SureQL inside it, and confirm no page-level horizontal overflow.

Project: [[01 Live UI and SureQL Loop]]
