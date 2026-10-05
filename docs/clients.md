# Sure Clients

Sure is centered on a Rails server. Every client connects to that server and
uses the same accounts, users, authentication rules, and financial data. A
client can be a browser, a native app, a mobile app, an automation script, or an
LLM agent using Sure's MCP endpoint.

Use this guide to choose the right entry point for a person, device, or
integration.

## Client overview

| Client | Best for | Status | Entry point |
| --- | --- | --- | --- |
| Web app | Full everyday use, administration, and self-hosted access from any modern browser. | Primary client | Run the Rails app and visit the server URL. For local development, use `bin/dev` and open `http://localhost:3000`. |
| macOS desktop app | People who want Sure in a native Mac window with system app chrome and deep-link handling. | Native shell around the web app | See [Sure Desktop](../desktop/README.md). |
| Mobile app | Basic mobile access on iOS and Android, currently focused on login and account balances. | Flutter companion app | See [Sure Mobile](../mobile/README.md). |
| LLM agents and assistants | Claude Desktop, GPT agents, local agents, or custom tools that need structured access to Sure data. | MCP endpoint for external AI clients | See [MCP Server for External AI Assistants](hosting/mcp.md). |
| Custom API clients | Scripts, services, importer experiments, dashboards, or other integrations. | HTTP API | See the OpenAPI spec at [docs/api/openapi.yaml](api/openapi.yaml) and endpoint guides such as [docs/api/transactions.md](api/transactions.md). |

## Web app

The web app is the complete Sure experience. It is the right default when a
person wants to use Sure directly, manage settings, connect providers, review
transactions, or work with features that may not yet be available in native
clients.

For self-hosting, start with the [Docker hosting guide](hosting/docker.md). For
local development, run the Rails app and visit the local server URL:

```sh
bin/dev
```

```text
http://localhost:3000
```

The web app also serves as the surface rendered by the macOS desktop app.

The React app's desktop **Toggle sidebar** control remembers its expanded or
collapsed state in localStorage across page refreshes. It defaults to expanded
when no preference is saved. If browser storage is unavailable, toggling still
works for the current session. The mobile navigation drawer remains separate.

Dashboards at `/dashboards` retain stable IDs in each user's browser-local
snapshot. New dashboards receive random 128-bit IDs. A report's **Configure**
button opens the dedicated configuration page at
`/dashboards/<dashboard-id>/reports/<report-id>/configure`, with both IDs in the
path rather than a report query parameter. Reloading that URL restores the
selected report editor. Saving, canceling, or using **Back to dashboard** returns
to the selected dashboard. Report headers keep their drag grip and resize handle
without the instructional hint text.

### Visual report builder

**Build report** creates a structured transaction report without opening the
SureQL editor. **Report type** selects **Transaction table** (`mode: "detail"`)
or **Pivot table** (`mode: "aggregate"`); new reports initially use Pivot table.
**Source** is a dropdown; Transactions is the current supported source.
Source, available fields, selected shelves, Filters, and Sorting live in
collapsible sidebar sections; the main area is the live table preview.
Each section uses Headless UI Disclosure with a chevron pointing right when
closed and down when open. Focus a section header and press Enter or Space to
toggle it; closed panels are skipped when tabbing through controls.
Drag field headers or grips between ordered shelves. Cards shift into their
proposed positions while dragging; the report definition and preview change
only after dropping. Dragging a compatible field over a closed shelf opens it.
Filters are unordered, editable cards without drag grips or drop targets;
add them with the palette's Filters buttons. Move-to excludes the current
shelf, incompatible destinations, and full destinations, and disappears when
none remain. Add-to, Move-to, and Remove controls remain available for keyboard
and touch; focus a grip and use Up/Down arrow keys to reorder.
Sorting uses the same card styling as the field shelves. Transaction-table
sorts have draggable headers and grips; their order sets sorting priority,
and reordering preserves each field's direction.

Transaction tables show one row per matching transaction, without aggregation,
grouping, or deduplication. Their Columns shelf selects and orders up to six
display fields: Date, Name, Account, Category, Amount, and Currency. All six
are selected initially. Sorting uses selected fields in priority order;
removing a column removes sorts that target it. Without explicit sorting,
newest transactions appear first. Every ordering has an entry-ID tie-breaker
so equal field values remain deterministic, including at preview limits.
Amounts retain exact decimal precision and are formatted in each row's
original currency even when Currency is not a displayed column. Mixed
currencies are allowed because transaction tables never sum or convert them.

Pivot tables expose Rows, Columns, and Values shelves. Their initial definition
groups categories across calendar months, sums original transaction amounts,
and filters to the last 90 days. They support up to three row dimensions, two
column dimensions, and three measures. Date grouping works on either axis;
row-measure sorting ranks the aggregate across all matching columns, including
columns omitted by the column-group limit.

Switching report types remembers each mode's column/group/measure/sort draft
while carrying the current shared filters into the selected mode.

Every valid definition change automatically refreshes the preview. Builder
results and saved report tables use the same server-side pagination: **10 rows
per page** by default, with **10, 25, 50, or 100** selectable in **Rows per page**.
**Previous / Next** fetch pages using a row offset; TanStack Query caches pages,
and TanStack Table manages pagination and table rendering. Pagination applies
after filtering, sorting, and full-data aggregation, selecting transactions or
whole pivot row groups. There is no total row cap; Next is disabled after the
last page. Changing filters, grouping, sorting, report type, or page size resets
the offset to zero. Table bodies scroll independently so navigation remains
reachable in the sticky builder preview. Pivot tables retain their
24-column-group limit and indicate when columns are omitted.

There is no Limited / Full preview mode. Page size is view state, not part of
the saved report definition. Saving requires successful results for the exact
current definition and page. Previous successful results remain visible and
are labeled stale while builder settings change or a later request fails.

All queries retain the user's account-access scope and exclude excluded
transactions. Category grouping preserves uncategorized transactions and
distinguishes categories with identical names. Missing intersections and null
aggregates show a dash; actual zeroes remain numeric. Amounts retain their
original signs: positive outflows and negative inflows. Their sum is not
automatically spending. Pivot monetary measures require either a single
filtered currency or Currency in Rows; currencies are never converted or added
together.
Relative date windows include today and the preceding days, excluding future
transactions. Filters combine with AND.

Visual reports save a versioned definition, not generated query text, in the
existing browser-local dashboard snapshot. Existing SureQL reports remain
unchanged; Add table and Add chart still open their existing editor.

### Existing SureQL reports

The query editor supports SureQL only: there is no language selector or PRQL
mode. Syntax highlighting, source suggestions, validation and Run all use
SureQL. The editor grows and shrinks with query content from 128px to 640px,
then scrolls internally for longer queries. Copy, Reset and Run use compact footer buttons
beside the cursor position and character count, without a separate query heading
or shortcut hint. Command/Ctrl+Enter still runs the query. A new chart report
retains its chart presentation across configuration-page navigation and reload,
before its pivot is configured.

Autocomplete offers account and category joins after `from transactions`.
Join completions preserve a typed alias and replace partial join text. Typing `.`
after a declared account or category alias suggests its fields, such as
`a.name`, `bank.balance`, or `c.name`.

## macOS desktop app

The macOS desktop app is a Tauri 2 shell that renders the full Sure web app in a
native Mac window. On first launch, it asks for the Sure server URL, checks the
server health endpoint, and then loads the normal sign-in flow.

Use it when someone wants a desktop app experience without a separate desktop
data model. It uses the same server, authentication, MFA, and permissions as the
browser.

See [desktop/README.md](../desktop/README.md) for development, release, unsigned
install, deep link, and notarization notes.

## Mobile app

The mobile app is a Flutter companion app for iOS and Android. It connects to a
Sure server through the API and currently focuses on core mobile flows such as
authentication and viewing account balances.

Use it when someone needs phone access and the feature set they need is
available in the mobile client. For the full application surface, use the web
app.

See [mobile/README.md](../mobile/README.md) for setup and
[mobile/docs/TECHNICAL_GUIDE.md](../mobile/docs/TECHNICAL_GUIDE.md) for deeper
implementation notes.

## LLM agents and MCP clients

LLM agents are clients too. Sure exposes a Model Context Protocol endpoint for
external assistants and agent runtimes that need structured access to financial
data.

Use MCP when a person wants an assistant such as Claude Desktop, a GPT agent, or
a custom local agent to query Sure directly instead of copying data into a chat
window. MCP access is configured server-side with a bearer token and a specific
Sure user email.

Because this gives the assistant read access to that user's family data, treat
the MCP token like a production secret and only connect assistants and providers
the user trusts.

See [docs/hosting/mcp.md](hosting/mcp.md) for setup and protocol details.

## Custom API clients

Custom clients can call Sure's HTTP API directly. This is the right path for
scripts, services, import experiments, dashboards, and integrations that do not
need an MCP-compatible agent interface.

API requests can authenticate with a user-generated `X-Api-Key` header, or with
OAuth2 bearer tokens from Sure's Doorkeeper authorization server for registered
app clients.

Start with the OpenAPI spec at [docs/api/openapi.yaml](api/openapi.yaml) and
endpoint guides such as [docs/api/transactions.md](api/transactions.md).

## Choosing a client

- Start with the web app when a person needs the complete Sure experience.
- Use the macOS desktop app when they want the web app wrapped in a native Mac
  application.
- Use the mobile app for iOS or Android access to supported mobile flows.
- Use MCP for LLM agents and assistant runtimes.
- Use the HTTP API for custom software integrations.

All clients should connect to a Sure server the user controls or trusts. Native,
mobile, API, and MCP clients do not replace the server; they are different ways
to access it.

## Native reporting and device continuity

Read monthly server-calculated totals and the daily spending comparison using
[`GET /api/v1/cash_flow`](api/openapi.yaml). Native clients should
use these values instead of rebuilding Sure's reporting rules from transactions.

Structural node `name` values are fallback labels; clients should localize
`cash_flow`, `surplus`, and `deficit` by `kind` at the presentation boundary.

`include` and `view` are mutually exclusive; combining them returns `422 invalid_view`.

Request `include=sankey` to append category nodes and links to the monthly
summary. For arbitrary date filters, request
`view=sankey&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` to receive only the graph
and its currency, time zone, as-of date, and inclusive period. This avoids building
a daily series for long date ranges. The default monthly response is unchanged.

Graph values are decimal strings in family currency, with stable node IDs and
zero-based link indices. Refunds are netted within each category; parent direct
amounts exclude children before each direction is grouped. Graph income and
spending can therefore differ from the gross monthly figures, while net savings
agrees. Surplus and deficit nodes balance the central flow. Clients own layout,
formatting, and structural colors; all financial aggregation stays on Sure.

The public endpoint uses the standard OAuth/API-key authentication and does not
accept browser sessions. Responses are private and not HTTP-cacheable; native
clients retain their own authenticated, identity-scoped offline cache.

The Turbo dashboard fetches `/dashboard/cash_flow` through a normal web controller,
with session authentication, onboarding checks, and the current user's preview
gate. It honors the impersonated browser identity and finance-account scope. Both
endpoints use `IncomeStatement::CashFlowGraph` and `IncomeStatement::Sankey`, sharing
the graph representation and aggregation without sharing authentication paths.

The web dashboard keeps its original Sankey unchanged and renders the new
server-calculated chart directly below it only for users with preview features
enabled. See
[Preview surveys and event capture](hosting/preview-feedback.md) for deployment
configuration, survey behavior, and event definitions. Sankey is the first
implementation of this feedback pattern.

Push registration accepts an optional `device_key`: 32 securely random bytes
encoded as 64 lowercase hex characters, generated independently per server and
stored only in secure device storage. Preserve it across user logout. The server
stores only its SHA-256 digest. If the APNs token already belongs to another user,
a matching key allows atomic replacement with a **new subscription ID**, making
old queued deliveries and deletes harmless. A missing or wrong proof returns 422.
An existing registration without a digest must first be enrolled by its original
owner or removed by that owner; knowing the APNs token alone never authorizes transfer.

## FinanceKit device publisher

The native Apple client can enroll as a FinanceKit device publisher, map explicitly selected Wallet accounts, and upload an ordered local outbox during foreground or iOS-granted background execution. Setup and repair use normal Sure authentication; uploads use a revocable one-purpose credential that cannot read Sure data. Stable server-issued account lineages preserve identity across publisher replacement. See the [OpenAPI reference](api/openapi.yaml) and [operator guide](hosting/financekit.md).
