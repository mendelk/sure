---
pm-project: true
id: "pyp5yq7mmtqgqupi"
title: "Sure Alt Frontend"
description: "Build a production-quality, installable alternate Sure web frontend that uses only the versioned Sure JSON API. The program targets full self-hosted and super-admin web parity through staged releases, with React, TanStack Start and related TanStack libraries, generated OpenAPI types and Zod runtime parsers, StyleX, and a secure server-side BFF. Ready work is any todo task whose dependencies are complete."
color: "#8b72be"
icon: "lucide-paint-bucket"
taskIds: []
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-06T23:49:05.137Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

# lucide-paint-bucket Sure Alt Frontend

Build a production-quality, installable alternate Sure web frontend that uses only the versioned Sure JSON API. The program targets full self-hosted and super-admin web parity through staged releases, with React, TanStack Start and related TanStack libraries, generated OpenAPI types and Zod runtime parsers, StyleX, and a secure server-side BFF. Ready work is any todo task whose dependencies are complete.

## Engineering directives

### Runtime API contracts

`docs/api/openapi.yaml` is the canonical full-stack API contract. Every documented operation must have deterministic generated TypeScript types and Zod runtime parsers for its parameters, request bodies, success responses, and error responses. Browser and BFF code must parse untrusted API-boundary data before it enters application state; compile-time types alone are not sufficient.

Frontend and BFF work must consume the generated contract rather than hand-maintaining duplicate interfaces or validators. An API change is incomplete until OpenAPI, generated TypeScript, generated Zod parsers, operation-coverage checks, and drift checks are updated and passing.
