---
pm-task: true
projectId: "[[12 Onboarding Portability and Platform|12 Onboarding Portability and Platform]]"
parentId:
id: t_lfp_1108
title: Expose complete planning API
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - api
  - platform
  - portability
subtaskIds: []
dependencies:
  - "[[define-calculation-versioning-and-reproducibility|Define calculation versioning and reproducibility]]"
  - "[[manage-independent-scenario-plans|Manage independent scenario plans]]"
  - "[[make-simulation-results-auditable-and-repeatable|Make simulation results auditable and repeatable]]"
  - "[[deliver-yearly-summary-and-core-plan-metrics|Deliver yearly summary and core plan metrics]]"
  - "[[provide-complete-plan-portability-and-plugin-contracts|Provide complete plan portability and plugin contracts]]"
timeEstimate: 40
createdAt: 2026-09-07T12:00:00.000Z
updatedAt: 2026-09-07T12:00:00.000Z
---

Make every supported planning workflow available through a stable, documented Rails API rather than limiting capabilities to server-rendered web interactions.

## Acceptance criteria
- API consumers can manage planning profiles, snapshots, plans, revisions, events, milestones, flows, assumptions, simulations, results, comparisons, progress, and exports within household permissions.
- Long-running simulations expose explicit queued, running, complete, failed, cancelled, and stale states without requiring request-scoped execution.
- Calculation responses include provenance, warnings, units, real/nominal context, ruleset versions, and links to drill-down resources.
- Mutation contracts use optimistic concurrency or equivalent revision protection and never silently overwrite simultaneous edits.
- OpenAPI documentation and Minitest behavioral coverage follow Sure's API endpoint consistency requirements.

## Verification
- Exercise a complete plan lifecycle and deterministic/Monte Carlo result retrieval through API calls alone.

Project: [[12 Onboarding Portability and Platform]]
