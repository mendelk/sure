---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_004
title: Build reference plans and financial invariants
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - validation
  - fixtures
  - invariants
subtaskIds: []
dependencies:
  - "[[extract-only-proven-planning-seams|Extract only proven planning seams]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:56:58.287Z
timeEstimate: 16
---

Turn the reviewed households and ledgers into durable evidence that later refactoring and persistence do not change outcomes.

## Ownership boundary
Own behavior-level reference plans and invariants, not snapshots of incidental implementation or wording.

## Acceptance criteria
- Cover accumulation, retirement, shortfall, tax, healthcare, risk, survivor, estate, and maintained international cases.
- Enforce ledger conservation, account-to-household rollups, ownership, tax-year, timing, currency, and scenario-isolation invariants.
- Keep stochastic and optimizer reference runs reproducible from versioned inputs and seeds.
- Require explainable tolerances and sources for externally defined financial examples.

## Verification
- Run every reference plan through the same public calculation path used by the product and deliberately violate each invariant once.

Project: [[07 Productize the Proven Direction]]
