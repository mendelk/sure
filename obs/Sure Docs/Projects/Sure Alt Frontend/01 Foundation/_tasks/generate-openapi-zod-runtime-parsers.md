---
pm-task: true
projectId: "p_alt_foundation"
parentId: null
id: "t_alt_fnd_018"
title: "Generate OpenAPI Zod runtime parsers"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "openapi", "zod", "api", "type-safety"]
subtaskIds: []
dependencies: ["t_alt_fnd_004"]
timeEstimate: 24
createdAt: "2026-09-07T14:45:00.000Z"
updatedAt: "2026-09-07T14:45:00.000Z"
---

Generate runtime Zod parsers for every operation in the canonical Sure OpenAPI document, then make those parsers the required validation boundary for frontend and BFF API data.

## Acceptance criteria
- Generate and commit a deterministic, typed Zod contract keyed by HTTP method and path for every operation in `docs/api/openapi.yaml`; cover path/query/header parameters, request bodies, documented success responses, and documented error responses without hand-copying schemas.
- Use a maintained generator or a small deterministic generator built on maintained OpenAPI and Zod libraries. Document the choice, pin compatible versions, and derive or cross-check TypeScript types from the same OpenAPI source so generated static and runtime contracts cannot silently diverge.
- Integrate response parsing into the typed fetch layer before data reaches TanStack Query or application state. Normalize contract violations into a distinct typed application error with correlation metadata and redacted diagnostics.
- Export parser lookup helpers that the server-only BFF transport can use for request and upstream-response validation without exposing credentials or server-only configuration to browser bundles.
- Correctly represent optional and nullable fields, arrays, records/additional properties, enums, unions/discriminators, date-time strings, JSON bodies, multipart metadata, empty responses, and binary media. Fail generation or coverage checks for unsupported OpenAPI constructs rather than silently accepting unknown data.
- Keep runtime consumption tree-shakeable or operation-scoped so adding complete parser coverage does not force every route to load the entire contract in its browser bundle.
- Add root generation and drift commands and enforce them in CI. Future OpenAPI changes are incomplete until TypeScript types, Zod parsers, and operation coverage regenerate cleanly.

## Verification
- Generate twice with byte-identical output and prove the drift command fails after an intentional generated-file edit.
- An operation-coverage test proves every OpenAPI method/path has request and response parser metadata with no undocumented exceptions.
- Runtime tests accept representative valid payloads and reject malformed nested, nullable, union, error, empty, and binary cases; compile-time tests prove inferred parser output remains compatible with generated OpenAPI types.
- Typed-client tests prove malformed upstream payloads cannot enter application state and contract errors contain no secrets or raw financial payloads.
- `pnpm checks:web`, OpenAPI/Zod drift checks, and the production build pass.

Project: [[01 Foundation]]
