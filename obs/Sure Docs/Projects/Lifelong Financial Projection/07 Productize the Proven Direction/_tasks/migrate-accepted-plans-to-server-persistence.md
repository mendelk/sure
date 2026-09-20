---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_010
title: Migrate accepted plans to server persistence
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - database
  - migrations
  - release
subtaskIds: []
dependencies:
  - "[[design-server-persistence-from-the-proven-local-shape|Design server persistence from the proven local shape]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:57:02.714Z
timeEstimate: 20
---

Make the final source-of-truth transition from localStorage to durable server persistence using the product shape proven by all prior phases.

## Ownership boundary
This is the first task allowed to add planning tables, Active Record models, persistence endpoints, synchronization, and database migrations.

## Acceptance criteria
- Add the minimal Rails persistence model and ActiveRecord::Migration[7.2] migrations required by the proven contract.
- Import local plans through a reviewable, idempotent flow that preserves the local original until server verification succeeds.
- Enforce Current.family ownership, authorization, atomic revisions, conflict handling, backup, export, restore, and deletion behavior.
- Cut over every accepted caller, remove localStorage as the source of truth, and retain only intentional offline or recovery caches.
- Prove managed and self-hosted upgrades, interrupted imports, rollback, cross-device use, and complete recovery without financial-result changes.

## Verification
- Run the full reference, invariant, browser, API, migration, interruption, rollback, and clean-install scenarios against actual server persistence.

Project: [[07 Productize the Proven Direction]]
