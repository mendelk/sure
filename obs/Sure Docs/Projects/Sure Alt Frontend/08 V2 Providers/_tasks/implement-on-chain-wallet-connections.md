---
pm-task: true
projectId: "p_alt_v2_providers"
parentId: null
id: "t_alt_ing_013"
title: "Implement on-chain wallet connections"
type: "task"
status: "todo"
priority: "high"
start: ""
due: ""
progress: 0
assignees: []
tags: ["providers", "crypto", "wallets"]
subtaskIds: []
dependencies: ["t_alt_ing_003", "t_alt_ing_004", "t_alt_rel_007"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

API-enable and implement self-custody wallet preview, linking, token review, pricing enablement, sync, and selective/full disconnect.

## Acceptance criteria
- Validate supported network/address input and preview wallet ownership-independent public data safely.
- Let users review imported assets/tokens and link or create compatible Sure accounts before completion.
- Support enabling required crypto prices and make pricing limitations explicit.
- Implement token updates, disconnect-wallet, disconnect-asset, and recoverable sync states with confirmations.
- Apply privacy masking and never imply Sure has custody or signing access.

## Verification
- Contract and browser tests cover supported/invalid addresses, token review, pricing, sync, selective disconnect, and full disconnect.

Project: [[08 V2 Providers]]
