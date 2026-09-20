---
pm-project: true
id: "p_lfp_root"
title: "Lifelong Financial Projection"
color: "#256f5a"
icon: "lucide-telescope"
taskIds: []
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-20T00:00:00.000Z"
updatedAt: "2026-09-20T17:59:26.168Z"
config:
  defaultView: "table"
  autoSchedule: false
---

# lucide-telescope Lifelong Financial Projection

Build the product from the screen inward. Start with current Sure balances, a few editable assumptions, and a year-by-year projection that survives reloads in localStorage. Add one observable planning capability at a time, review it in the browser, and let accepted behavior determine the next data and calculation shape. Architecture is an output of repeated implementation, not a prerequisite.

## Delivery principles
- Get to a useful projection in the first task; every later task must add visible user value or prove a financial invariant.
- Keep plans, scenarios, progress snapshots, and experimental rule selections in localStorage until the final persistence task.
- Read current Sure financial data as an explicit plan baseline; never mutate accounts, transactions, holdings, or historical reports from a projection.
- End each experimental workstream with a browser review that marks behavior keep, change, or delete. Remove rejected paths instead of preserving them behind flags.
- Extract shared domain, calculation, rules, API, and storage boundaries only after accepted implementations demonstrate repeated needs.
- Treat every result as an explainable planning estimate, not tax filing, legal advice, or a guaranteed outcome.
- Keep the comprehensive destination: household plans, events, goals, cash flow, investments, retirement, taxes, benefits, healthcare, uncertainty, optimization, estate, international rules, reporting, portability, API access, and progress tracking.
- Make the United States the first production-grade jurisdiction, then use complete Canadian, UK, and Australian presets to discover international seams.
- Deliver through the Rails web application and documented contracts for desktop, mobile, and alternate frontend consumers; do not create parallel planning implementations.
- Add server persistence, Active Record models, and ActiveRecord::Migration[7.2] migrations only in the final task, after the accepted local shape and invariants are known.

## Workstream progression
1. [[01 Live Projection Loop]] — Start with a browser-verifiable projection, then improve only what the working slice proves necessary. Keep the plan and assumptions in localStorage and keep calculations local to the feature.
2. [[02 Timeline and Scenario Experiments]] — Grow the projection through visible planning actions. Treat data shapes as experimental and prefer small end-to-end additions over a complete event taxonomy.
3. [[03 Cash Flow and Retirement Experiments]] — Increase fidelity one visible behavior at a time. Calculation structure follows accepted accumulation and drawdown examples; it does not precede them.
4. [[04 Tax Benefit and Healthcare Experiments]] — Tax and benefit behavior must be visible in real plans before it becomes architecture. These are planning estimates, never filing calculations.
5. [[05 Risk Analytics and Guidance Experiments]] — Risk numbers are useful only when users can inspect assumptions and bad outcomes. Build interpretation and trial inspection before optimization machinery.
6. [[06 Estate International and Portability Experiments]] — Prove advanced planning outcomes with complete reference households. Country and estate architecture follows working presets, not the other way around.
7. [[07 Productize the Proven Direction]] — Architecture, server persistence, and migrations are outputs of the accepted planning experience. Until the final task, localStorage remains the plan source of truth and server financial data remains read-only.
