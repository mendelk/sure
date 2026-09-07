---
pm-task: true
projectId: "p_alt_ingestion"
parentId: null
id: "t_alt_ing_001"
title: "Inventory provider connection state machines"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "discovery", "api"]
subtaskIds: []
dependencies: ["t_alt_fnd_001", "t_alt_fnd_004"]
timeEstimate: 28
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Document every enabled provider's connection, reauthorization, account-selection/linking, sync, review, and disconnection state machine.

## Acceptance criteria
- Cover Plaid, Enable Banking, SnapTrade, SimpleFIN, Lunchflow, Up, Coinbase, Binance, Kraken, CoinStats, Questrade, IBKR, Trading212, Indexa, Mercury, Wise, Brex, Akahu, Redbark, Sophtron, and on-chain wallets.
- Reconcile the list with the provider registry and add a linked task for any enabled provider omitted above.
- Record credentials, redirects/callbacks, MFA/challenges, temporary state, polling, account mapping, errors, and provider-specific capabilities.
- Map each transition to an existing JSON endpoint or precise API gap; identify secrets that must never traverse or persist in the browser.
- Produce diagrams/tables usable as acceptance fixtures by provider implementation tasks.

## Verification
- Each enabled provider has one complete path from disconnected to usable account and one disconnect/recovery path.

Project: [[03 Data Ingestion and Providers]]
