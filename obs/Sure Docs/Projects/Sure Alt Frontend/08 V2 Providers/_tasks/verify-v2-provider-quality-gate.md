---
pm-task: true
projectId: "[[08 V2 Providers|08 V2 Providers]]"
parentId:
id: t_alt_v2p_010
title: Verify V2 provider quality gate
type: task
status: todo
priority: critical
start: ""
due: ""
progress: 0
assignees: []
tags:
  - milestone
  - providers
  - quality
  - v2
subtaskIds: []
dependencies:
  - "[[implement-plaid-and-enable-banking-connections|Implement Plaid and Enable Banking connections]]"
  - "[[implement-snaptrade-connection-flows|Implement SnapTrade connection flows]]"
  - "[[implement-lunchflow-and-up-connections|Implement Lunchflow and Up connections]]"
  - "[[implement-exchange-and-coinstats-connections|Implement exchange and CoinStats connections]]"
  - "[[implement-brokerage-provider-connections|Implement brokerage provider connections]]"
  - "[[implement-business-finance-provider-connections|Implement business finance provider connections]]"
  - "[[implement-akahu-and-redbark-connections|Implement Akahu and Redbark connections]]"
  - "[[implement-sophtron-challenge-flow|Implement Sophtron challenge flow]]"
  - "[[implement-on-chain-wallet-connections|Implement on-chain wallet connections]]"
  - "[[add-frontend-ci-and-performance-budgets|Add frontend CI and performance budgets]]"
createdAt: 2026-09-07T01:09:35.000Z
updatedAt: 2026-09-20T17:56:56.752Z
timeEstimate: 40
---

Verify every V2 provider meets API-only parity, security, accessibility, and release-quality requirements.

## Acceptance criteria
- Execute each audited provider state machine's success, cancellation, expiry, recovery, sync, account-linking, and disconnect evidence.
- Prove credentials, tokens, and raw payloads do not enter browser persistence, bundles, logs, traces, screenshots, or errors.
- Pass WCAG 2.2 AA, responsive evergreen-browser checks, OpenAPI drift, performance budgets, and role authorization tests.
- Reconcile the current provider registry and create explicit blockers for newly enabled non-SimpleFIN providers.
- Record sandbox limitations and manual evidence without marking untested paths complete.

## Verification
- The V2 provider matrix has no unexplained gap and no unresolved critical/high defect.

Project: [[08 V2 Providers]]
