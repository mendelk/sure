---
pm-project: true
id: "pyp5yq7mmtqgqupi"
title: "Sure Alt Frontend"
description: "Build the alternate Sure frontend in usable vertical slices: establish the platform, ship manual accounts and transaction management first, then add dashboards, imports, connected accounts, reports, planning, automation, administration, and full parity. Ready work is any todo task whose dependencies are complete."
color: "#8b72be"
icon: "lucide-paint-bucket"
taskIds: []
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-06T23:49:05.137Z"
updatedAt: "2026-09-08T04:00:00.000Z"
---

# lucide-paint-bucket Sure Alt Frontend

Build a production-quality alternate Sure frontend in usable vertical slices. The first product milestone is deliberately narrow: a signed-in user can create and manage manual accounts, browse transactions, and create, edit, delete, and classify transactions. Dashboards, charts, reports, imports, connected accounts, planning, automation, advanced settings, and parity work build on that proven core instead of blocking it.

## Delivery roadmap

### Milestone 0: Essential platform

Complete only the architecture, generated contracts, secure BFF sessions, design tokens, UI primitives, app shell, integration harness, API compatibility, and security follow-ups needed to build the core safely. Platform enhancements such as PWA support, broad observability, chart selection, and performance budgets are post-core work.

### Milestone 1: Core accounts and transactions

Deliver one complete manual workflow before expanding scope:

1. Complete the account management API and manual account forms.
2. Add account summary navigation with stable account routes.
3. Complete the transaction list contract and responsive browsing route.
4. Add transaction create, edit, delete, and category workflows.
5. Harden authentication, error, privacy, and recovery behavior across those workflows.
6. Pass the core accounts and transactions quality gate.

The core milestone explicitly excludes dashboards and charts, provider sync, imports and exports, connected accounts, advanced account settings and sharing, tags and merchant management, transaction splits, reports, investments, budgets, goals, automation, AI, onboarding, and administration.

### Milestone 2: Dashboard and advanced finance

Build dashboard contracts, trends, advanced transaction splitting, account history, investments, transfers, reports, budgets, and goals only after the core quality gate.

### Milestone 3: Imports and connected accounts

Add import/export workflows, provider management, SimpleFIN, and later provider integrations after manual accounts and transactions are reliable.

### Milestone 4: Automation, settings, and administration

Layer recurring workflows, rules, AI, user settings, onboarding, family administration, and super-admin tools on the stable financial core.

### Milestone 5: Staged releases and parity

Package and release the core first, then publish ingestion, finance/planning, automation/admin, provider, and final parity releases in that order.

## Engineering directives

### Runtime API contracts

`docs/api/openapi.yaml` is the canonical full-stack API contract. Every documented operation must have deterministic generated TypeScript types and Zod runtime parsers for its parameters, request bodies, success responses, and error responses. Browser and BFF code must parse untrusted API-boundary data before it enters application state; compile-time types alone are not sufficient.

Frontend and BFF work must consume the generated contract rather than hand-maintaining duplicate interfaces or validators. Runtime parsers must come from a pinned, maintained OpenAPI-to-Zod generator; this project must not own a custom OpenAPI schema compiler. Small adapters may index or invoke generated exports, but they must not reinterpret OpenAPI schema semantics. An API change is incomplete until OpenAPI, generated TypeScript, generated Zod parsers, operation-coverage checks, and drift checks are updated and passing.

### Sequencing rule

Do not start a post-core task solely because its technical prerequisites are available. Post-core epic roots depend on `t_alt_beta_012`, the core accounts and transactions quality gate. Work already in progress may finish, but it does not expand the Milestone 1 definition of done.
