---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_008"
title: "Implement exchange and CoinStats connections"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "crypto", "api"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement Coinbase, Binance, Kraken, and CoinStats wallet/exchange connection workflows.

## Acceptance criteria
- Support each audited credential, wallet, or exchange path with provider-specific validation and instructions.
- Implement account selection/linking, asset review where required, sync, edit/reconnect, and disconnect.
- Never expose API secrets after submission and prevent secret entry from appearing in logs, telemetry, history, or persisted browser state.
- Handle permission/read-only requirements, unsupported regions/assets, rate limits, and partial imports clearly.
- Preserve provider attribution and crypto/account subtype choices.

## Verification
- Contract and frontend tests cover one successful and representative failure/recovery path for every provider.

Project: [[08 V2 Providers]]
