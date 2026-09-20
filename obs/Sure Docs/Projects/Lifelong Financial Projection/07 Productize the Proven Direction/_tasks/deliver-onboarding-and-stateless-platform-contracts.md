---
pm-task: true
projectId: "[[07 Productize the Proven Direction|07 Productize the Proven Direction]]"
parentId:
id: t_lfp_productize_007
title: Deliver onboarding and stateless platform contracts
type: task
status: todo
priority: high
start: ""
due: ""
progress: 0
assignees: []
tags:
  - onboarding
  - api
  - platform
subtaskIds: []
dependencies:
  - "[[complete-accessibility,-privacy,-and-performance|Complete accessibility, privacy, and performance]]"
createdAt: 2026-09-20T00:00:00.000Z
updatedAt: 2026-09-20T17:57:00.634Z
timeEstimate: 14
---

Make the proven planner approachable and consumable without making the database the source of truth yet.

## Ownership boundary
Own onboarding, stateless calculation contracts, and client integration. Plans remain browser-local until the final task.

## Acceptance criteria
- Guide users from current finances or a template to a first useful projection with assumptions and limitations visible.
- Expose documented authenticated calculation and validation APIs that accept complete plan payloads without storing them.
- Keep desktop, mobile, and Sure Alt Frontend as consumers of explicit contracts rather than separate implementations here.
- Provide export/import recovery and self-hosted behavior equivalent to managed mode.

## Verification
- Complete onboarding from empty and connected families, calculate an exported plan through the API, and consume the same contract from a client fixture.

Project: [[07 Productize the Proven Direction]]
