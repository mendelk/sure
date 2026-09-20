---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_008
title: Validate parity and release in usable stages
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - validation
  - rollout
  - quality
subtaskIds: []
dependencies:
  - "[[deliver-onboarding-and-stateless-platform-contracts|Deliver onboarding and stateless platform contracts]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:57:01.365Z
timeEstimate: 12
---

Close material capability gaps and prepare staged releases from the integrated, still-local product.

## Ownership boundary
Own product-level quality gates and release slices. Do not hide incomplete persistence behind a misleading production rollout.

## Acceptance criteria
- Compare accepted capabilities with the original comprehensive planning target and document intentional exclusions.
- Require reference-plan, invariant, browser, accessibility, privacy, performance, import/export, and API evidence for each release slice.
- Release coherent usable stages with clear estimate limitations, jurisdiction coverage, and rollback behavior.
- Keep localStorage explicitly labeled as the plan source of truth until the final persistence migration is complete.

## Verification
- Run the full release checklist on representative managed and self-hosted installations and rehearse rollback of a local-plan version update.

Project: [[07 Productize the Proven Direction]]
