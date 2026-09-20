---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: "t_lfp_productize_005"
title: "Version calculations, rules, and local plan changes"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["versioning", "reproducibility", "local-storage"]
subtaskIds: []
dependencies: ["[[build-reference-plans-and-financial-invariants|Build reference plans and financial invariants]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:56:59.176Z"
timeEstimate: 12
---

Make long-lived results reproducible and local plan evolution recoverable now that the accepted shapes are known.

## Ownership boundary
Version proven local payloads and calculations. This task still adds no database schema, Active Record model, or server persistence.

## Acceptance criteria
- Record plan schema, calculation, rule set, market-data basis, and random seed with each saved result or export.
- Apply idempotent local transformations with preview, backup, failure recovery, and explicit meaning-changing review.
- Reproduce prior results when required inputs and rules remain available and explain when exact reproduction is impossible.
- Preserve an exportable pre-transformation copy until the user accepts the upgraded local plan.

## Verification
- Upgrade representative payloads from every experimental version, interrupt one transformation, recover it, and reproduce reference results.

Project: [[07 Productize the Proven Direction|07 Productize the Proven Direction]]