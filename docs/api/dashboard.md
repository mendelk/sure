# Dashboard API Contract

The core dashboard is served by reusing existing versioned operations — no
dashboard-only write paths, no browser-side Rails view-model logic. The single
extended operation is `GET /api/v1/balance_sheet`; everything else on the
dashboard reuses the accounts, transactions, balances, and sync operations
documented in [`openapi.yaml`](openapi.yaml).

## Endpoint decisions

| Dashboard need | Operation | Decision |
| --- | --- | --- |
| Net worth / assets / liabilities totals | `GET /api/v1/balance_sheet` | Extended in place (new `trend`, `groups`, `sync`, `as_of`, `accounts_count` fields). Old `currency`/`net_worth`/`assets`/`liabilities` keys are unchanged. |
| Net worth / balance trends | `GET /api/v1/balance_sheet?period=` | Added as a bounded `period` enum on the same operation (default `last_30_days`). `GET /api/v1/balances` remains the per-account history source for account-detail views. |
| Grouped account summaries | `GET /api/v1/balance_sheet` → `groups` | Added as classification → accountable-type groupings with converted totals. `GET /api/v1/accounts` remains the paginated account source for management views. |
| Recent transactions | `GET /api/v1/transactions?per_page=5` | Reused as-is (reverse-chronological index; first page is the recent list). No change. |
| Current sync state | `GET /api/v1/balance_sheet` → `sync` + `GET /api/v1/syncs/latest` | Added a sync summary to the balance-sheet payload for the one-call dashboard; `GET /api/v1/syncs/latest` remains the polling source for sync progress UI, and `POST /api/v1/sync` triggers a sync. No change to those operations. |

Related but out of scope for this contract: dashboard layout/order
preferences (`GAP-API-07`), which stay server-side until owned.

## Expected request count and representative payload size

A full dashboard paint needs **2 requests**:

1. `GET /api/v1/balance_sheet?period=last_30_days` — totals, trend, groups, sync.
2. `GET /api/v1/transactions?per_page=5` — recent transactions.

Sync progress polling adds `GET /api/v1/syncs/latest` only while
`sync.syncing` is true.

Representative sizes (measured shape, JSON before compression):

| Payload | Small family (3 accounts) | Large family (40 accounts, 365-day trend) |
| --- | --- | --- |
| `balance_sheet` totals + meta | ~1 KB | ~1 KB |
| `trend` (31 daily points) | ~8 KB | — |
| `trend` (53 weekly points, `last_365_days`) | — | ~14 KB |
| `groups` | ~2 KB | ~25 KB |
| `sync` | < 1 KB | < 1 KB |
| **Total** | **~12 KB** | **~40 KB** |
| Recent transactions (`per_page=5`) | ~6 KB | ~6 KB |

The trend series is capped by construction: the served periods allow at most
`last_365_days` (weekly interval, ~53 points) and the schema caps `values` at
400 items. Per-account balance history stays paginated (`max 100/page`) and is
never embedded in the dashboard payload.

## Currency semantics

- Every money object is `{ amount, currency, formatted }`, where `amount` is a
  numeric string, `currency` is an ISO 4217 code, and `formatted` is the
  locale-formatted display string.
- Totals (`net_worth`, `assets`, `liabilities`), group totals, trend values,
  and `converted_balance` are always expressed in the family's primary
  currency (`currency` at the payload root).
- Each account entry additionally carries its native `currency` and native
  `balance`; `converted_balance` is that balance converted at today's rate
  (missing FX rates fall back to 1:1 and are logged server-side).
- Expense/liability signs follow the ledger convention (liabilities reduce net
  worth); the trend's `favorable_direction` is always `"up"`.

## Date semantics

- `as_of` and trend `date`/`start_date`/`end_date` values are ISO 8601 calendar
  dates in the server timezone.
- `period` accepts only `last_7_days`, `last_30_days`, `last_90_days`,
  `last_365_days`, `current_month`, `current_year`; anything else returns
  `422 validation_failed`. The interval is `1 day`, except periods longer than
  a year which aggregate to `1 week`.
- Sync timestamps (`last_completed_at`, `last_activity_at`, `created_at`,
  `updated_at`, `completed_at`) are ISO 8601 datetimes and may be `null` when
  the family never synced.

## Authorization and family scoping

- All dashboard reads require the `read` scope via `X-Api-Key`; a key without
  it receives `403 insufficient_scope`, and a missing/invalid key receives
  `401 unauthorized`.
- Totals, groups, and the trend are scoped to accounts the caller may access
  (`accessible_by` + `included_in_finances_for`); another family's data is
  never visible. The latest-sync lookup uses the same family scoping as
  `GET /api/v1/syncs`.

## Empty, stale, and syncing states

| State | Representation |
| --- | --- |
| Empty family | `accounts_count: 0`, zeroed totals, empty `account_groups`, zeroed trend values, `sync.latest: null`, `syncing: false`, `stale: false`. No errors. |
| Single-currency family | Native and converted balances agree; totals in family currency. |
| Multi-currency family | Native balances keep account currency; converted balances and totals use the family currency. |
| Syncing | `sync.syncing: true`, per-account `syncing: true` on syncing accounts, `sync.latest.status: "syncing"`. Totals reflect the last synced balances. |
| Stale | `sync.stale: true` when the last completed sync is older than 24 hours. Clients should surface a refresh affordance (`POST /api/v1/sync`) but still render cached totals. |
| Never synced | `last_completed_at: null`, `latest: null`, `stale: false`. |

## Query plan and N+1 prevention

`GET /api/v1/balance_sheet` executes a bounded query plan regardless of family
size:

1. One account load with eager includes (`accountable`, shares, providers) plus
   one batched today's-FX lookup for foreign currencies.
2. One aggregated net-worth series SQL query for the requested period (exchange
   rates resolved inside the query; empty families yield zeroed rows).
3. One preloaded latest-sync lookup (`syncable`, `children`) with the same
   family scoping as `GET /api/v1/syncs`.

Account rows, group totals, and trend points are computed in memory from those
three loads — no per-account or per-point queries. Minitest coverage for the
contract (empty, single-currency, multi-currency, stale, syncing families)
lives in
[`test/controllers/api/v1/balance_sheet_controller_test.rb`](../../test/controllers/api/v1/balance_sheet_controller_test.rb);
the rswag spec at
[`spec/requests/api/v1/balance_sheet_spec.rb`](../../spec/requests/api/v1/balance_sheet_spec.rb)
is documentation-only.
