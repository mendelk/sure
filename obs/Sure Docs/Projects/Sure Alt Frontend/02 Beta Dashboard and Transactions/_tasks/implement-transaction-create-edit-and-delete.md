---
pm-task: true
projectId: "p_alt_beta"
parentId: null
id: "t_alt_beta_006"
title: "Implement transaction create edit and delete"
type: "task"
status: "todo"
priority: "critical"
start: ""
due: ""
progress: 0
assignees: []
tags: ["frontend", "transactions", "forms"]
subtaskIds: []
dependencies: ["t_alt_beta_005"]
timeEstimate: 40
createdAt: "2026-09-07T01:09:35.000Z"
updatedAt: "2026-09-07T01:09:35.000Z"
---

Implement accessible transaction create, update, and delete workflows using TanStack Form and the generated contract.

## Acceptance criteria
- Cover account, name, amount, nature/type, date, notes, currency/exchange metadata supported by the API, and locked-state rules.
- Map server validation to fields and a form summary without discarding user input.
- Use explicit confirmation for delete and safe cache updates/rollback for every mutation.
- Block offline submission and duplicate submits; recover cleanly from expiry, conflicts, rate limits, and network loss.
- Return focus predictably and preserve list/search state after drawer/modal or full-page editing on mobile.

## Verification
- Component tests cover validation and mutation states; Playwright proves create/edit/delete against Rails at desktop and mobile widths.

Project: [[02 Beta Dashboard and Transactions]]
