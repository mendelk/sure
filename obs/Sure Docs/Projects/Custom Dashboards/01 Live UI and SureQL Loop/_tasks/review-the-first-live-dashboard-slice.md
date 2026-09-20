---
pm-task: true
projectId: "[[01 Live UI and SureQL Loop|01 Live UI and SureQL Loop]]"
parentId:
id: t_cd_live_007
title: Review the first live dashboard slice
type: task
status: "done"
priority: critical
start: ""
due: ""
progress: 100
assignees: []
tags:
  - product-review
  - dashboard
  - checkpoint
subtaskIds: []
dependencies:
  - "[[create-and-switch-between-dashboards|Create and switch between dashboards]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:55:49.454Z
timeEstimate: 4
---

Use the working browser experience to decide the next direction before hardening architecture or storage.

## Ownership boundary
Own the review checkpoint, not new infrastructure. Record decisions in this task's completion notes and update later task acceptance criteria when a reviewed choice invalidates them.

## Acceptance criteria
- Demonstrate query editing, real results, multiple report cards, drag/resize, multiple dashboards, refresh, and reset on the actual route.
- Decide whether report editing stays inline or moves to a focused surface, whether layout needs explicit edit mode, and which first presentations matter.
- Identify fields actually used by the live snapshot and remove proposed fields with no demonstrated UI need.
- List interaction problems and data-loss risks observed during use, ranked by impact.
- Explicitly mark behaviors as keep, change, or defer; do not approve abstractions by name alone.

## Verification
- The checkpoint is complete only after an interactive browser review and concrete keep/change/defer decisions are attached to the task.

Project: [[01 Live UI and SureQL Loop]]

## Review notes (2026-09-20, interactive browser walkthrough on `/dashboards`)

Demonstrated on the actual route against live container data: starter install
(`My dashboard` / `from transactions sort {-date} take 10` / 12x4 grid), Configure
modal with Monaco editor + Run + `Save and run`, per-card error isolation, second
dashboard creation (`Untitled 2`, empty reports/layout, `?dashboard=` URL), inline
rename with pre-filled editable title, header switcher popover, delete with
confirmation, refresh persistence, and starter reinstall after storage clear.
System suite: 15 runs, 116 assertions, 0 failures.

### Decisions
- Report editing: KEEP the focused Configure modal. Results-only cards plus
  Monaco-in-dialog is the proven loop; inline card editing deferred (card height
  churn and layout jump while typing).
- Layout: KEEP always-on drag handles. Dedicated `[data-report-drag-handle]`
  works, buttons stay interactive, no accidental-drag evidence; an explicit edit
  mode is deferred.
- Presentations: CHANGE next — table is the only demonstrated presentation and it
  stays the default, but the next experiment is one chart presentation (time
  series first candidate). No chart framework approved by name yet.

### Snapshot fields actually used
- `dashboards[].id` (stable, URL + layout join), `dashboards[].name` (switcher,
  title, options), `reports[].id/name/query` (card identity, header, execution),
  `layout[]` (`i/x/y/w/h`, joined to report IDs). No unused persisted fields
  found; no proposed field to remove.

### Interaction problems / data-loss risks (ranked)
1. (Medium) Drag/resize persists in-memory on `onLayoutChange` but only writes
   localStorage on drag/resize stop — refresh mid-drag loses the move. Acceptable
   for prototype; revisit if layout becomes shared.
2. (Low) New dashboard pre-fills `Untitled N`; count derives from array length,
   so delete-then-create can repeat a name. Cosmetic only; IDs stay unique.
3. (Low) Missing `?dashboard=` ID silently falls back to the first dashboard.
   Deterministic and tested, but silent — a notice is deferred.
4. (Low) One failed query isolates per card by design; no cross-card risk seen.

### Keep / change / defer
- Keep: SureQL edit → run → table loop, per-card run/save, drag handle + SE
  resize, URL search state with deterministic fallback, create-first empty state,
  confirmed delete/reset, transaction-style switcher and form-field title edit.
- Change: add one chart presentation next (refine task); no other behavior
  changes required by this review.
- Defer: inline card editing, explicit layout edit mode, chart framework choice,
  cross-tab sync, server persistence, fallback notice.
