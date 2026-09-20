---
pm-task: true
projectId: "[[06 Estate International and Portability Experiments|06 Estate International and Portability Experiments]]"
parentId:
id: "t_lfp_global_007"
title: "Export, import, and template complete local plans"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["portability", "templates", "local-storage"]
subtaskIds: []
dependencies: ["[[deliver-global-presets-and-an-annual-rules-loop|Deliver global presets and an annual rules loop]]"]
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:57:00.029Z"
timeEstimate: 10
---

Make advanced local plans portable and recoverable before any database becomes the source of truth.

## Ownership boundary
Own a versioned local plan package and curated templates. No server storage, sync, sharing, or migrations.

## Acceptance criteria
- Export assumptions, scenarios, local progress snapshots, rule references, and calculation provenance without secrets or live-account credentials.
- Validate imports, preview conflicts, preserve the prior local plan, and report degraded unsupported features.
- Provide educational templates for representative US and international households.
- Document the stateless calculation payload that future API and client consumers can use.

## Verification
- Round-trip complete plans through a clean browser profile, import an older package, reject a malformed package, and open every template.

Project: [[06 Estate International and Portability Experiments|06 Estate International and Portability Experiments]]