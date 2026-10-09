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

Dashboards at `/dashboards` use a user-scoped browser-local snapshot with
`formatVersion: 4`, containing a shared source catalog and independent dashboard layouts.
New dashboard IDs and all source IDs are random 128-bit identifiers.
A source has an ID, a name, and configuration only: either a structured
`ReportDefinition` or a SureQL query. It does not own layout or visualization
settings. This remains a browser-local prototype; there is no backend source
CRUD or cross-device synchronization. Incompatible older or malformed snapshots
are reset to the starter rather than migrated.

Manage sources on their own pages: `/sources` lists the catalog,
`/sources/new` creates a source, and `/sources/<id>/edit` edits one.
New sources default to **Structured**, the first **Source type** option;
**SureQL** remains the second option. Enter a **Source name** and save a
successful preview with **Save source**. Creating from the catalog or dashboard
header adds only the source. **Add table** and **Add chart** first open a
**Source** picker; **Use source** adds the selected source to the dashboard.
Creating from that picker opens the source page and adds the visualization
after saving. **Edit source** navigates to the editor from a card or catalog;
there is no dashboard-owned report configuration route or source-editor modal.
A saved edit updates every consumer; unsaved previews and cancellation leave
saved configuration unchanged. Sources can be created with no dashboards.

Both editor modes place **Cancel** and **Save source** to the right of the
**Edit source / Create source** heading. **Source name** and **Source type**
share the next row, with the name first. Structured sources place **Mode**
(**Aggregate / Details**) third on that same row; SureQL keeps the two-field row.

Dashboard layouts use the Puck editor's twelve-column **Grid** with layout-only
**GridItem** containers. **Edit layout** opens a draft where you can drag grid
items to reorder them and set their column span (1–12). **Height mode** selects
**Fixed** (the default, 3–12 rows of 80 pixels) or **Auto**. Auto removes the
container's fixed height and lets its content determine its intrinsic height;
it grows or shrinks with that content. Switching back to Fixed starts at four
rows. The selected mode is saved with the layout.
Grid item content slots accept any configured Puck component,
including nested **Grid** and **GridItem** containers, standalone **Table** and
**Chart** blocks, and **RichText** blocks. Grid slots accept grid items; only the
starter root grid is fixed and cannot be dragged, duplicated, or deleted.
Blocks can be reordered and moved between containers or to the root using
Puck's outline as well as the canvas. Root-level blocks are saved alongside the
starter grid. Select a Table or Chart block to choose its **Source**, create a
source on its own page, or edit the selected source. Per-user sessionStorage
retains unsaved layout drafts across source-page navigation and reloads.
Saving returns to the native Puck selection with the new source selected;
canceling retains the previous source and layout settings.
A new Table inserted from the palette starts unconfigured.
RichText uses Puck's built-in `richtext` field, native formatting controls, and
inline editing. Dashboards without visualizations can still be edited and contain
rich text. **Undo layout change** and **Redo layout change** operate on the
draft. **Save layout** persists it in browser storage; **Cancel** discards it.
The editor combines Puck's component palette, outline, and fields with an
unscaled preview. Layout is flow-based rather than absolute x/y positioning;
size changes use fields instead of corner resize handles. Cards stack in a
single column below the medium screen breakpoint.
Removing a component or deleting a dashboard preserves its sources in the shared
catalog. A source can appear repeatedly within a dashboard or across dashboards;
there is no source deletion UI. Confirming **Reset dashboards and sources**
replaces all dashboards, layouts, and source configurations with a fresh starter
dashboard and its two sources, and clears unsaved layout drafts. Custom sources
are removed; transactions remain untouched. Canceling leaves the workspace intact.
Card headers have no viewing-mode drag grips or resize handles.

### Table and chart consumers

Table blocks store `sourceId` and their own `visibleColumns`; an empty list means
all available columns. Column choices use stable field keys rather than positions.
Chart blocks store `sourceId`, **Chart type** (Line, Bar, or Pie), **Category field**,
and **Value field**. Empty category/value settings automatically choose compatible
metadata. Changing these presentation settings does not alter the source or
another consumer's settings.

All SPA table rendering lives in `app/javascript/spa/components/table.tsx`.
Structured aggregate, transaction-detail, and normalized source adapters supply
rows, column definitions, and formatting. The shared component owns table markup,
grouped and row headers, scroll regions, empty states, and client/server pagination.
Tables use their intrinsic height by default; fixed-height containers provide
vertical scrolling when explicitly configured. The pager places the page-size
dropdown and **per page** label between **Previous** and **Next**, on one line.
During a page request, **Next / Previous** are disabled and show spinners.
The existing rows remain visible until the requested page arrives.
Source previews omit the standalone **Running report…** status message.

Source results are normalized once per query into reusable columns and rows.
Consumers share a TanStack Query cache rooted at `["source", source.id]`, not a
dashboard, source configuration, or visualization setting. SureQL and structured
table pages append `[limit, offset]`; consumers of the same page share its result.
Charts and chart-field selectors share `["source", source.id, "all"]`, separately
from table pages. They fetch successive 100-row pages and publish the complete
result only after the final page arrives. SureQL results are normalized after
merging pages, preserving duplicate projected rows and their occurrence identities.
Results remain fresh indefinitely (`staleTime: Infinity`); saving a source cancels
requests and removes all its cached results/pages before updating the catalog.

SPA entity and configuration IDs have distinct Zod brands defined in
`app/javascript/spa/ids.ts`, including sources, dashboards, layout components,
dimension/measure/row/column identities, and transaction/account/reference IDs.
Storage, routes, API schemas, and editor boundaries parse these types; DOM IDs
and dynamic result-field names remain strings. `npm run spa:generate` applies
the Orval AST hook in `config/orval/spa-id-branding.ts`, preserving existing
validators while branding nested IDs. Transfer matching selects the counterpart
by Transaction ID rather than inferring it from amount signs, then resolves its
detail record's Entry ID before submitting the match.

Structured and SureQL charts consume the complete filtered source result, not a
table page. SureQL's own `take` limits still apply. Structured chart requests
include every pivot column group; the 24-column cap remains for tables and
previews. Charts do not show a page-only notice. Chart series are separated by currency;
amounts are never converted or summed across currencies. Negative pie values,
incompatible fields, and non-finite numeric values
produce an honest warning with a table fallback rather than fabricated data.

Chart hover tooltips use the selected source-column labels and actual category
values, not generic `x` / `y` channels or internal row positions. Line, bar, and
pie charts share this mapping; numeric values retain locale-aware formatting.

### Structured source builder

The source editor defaults to **Structured** to author a transaction result
without opening the SureQL editor. **Mode** selects **Aggregate**
(`mode: "aggregate"`, the default) or **Details** (`mode: "detail"`).
**Dataset** selects the underlying data; Transactions is currently supported.
Dataset, available fields, selected shelves, Filters, and Sorting live in
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

Switching modes remembers each mode's column/group/measure/sort draft
while carrying the current shared filters into the selected mode.

Every valid definition change automatically refreshes the preview. Builder
results and saved structured source tables use the same server-side pagination:
**10 rows per page** by default, with **10, 25, 50, or 100** selectable in the
inline **per page** selector.
**Previous / Next** fetch pages using a row offset; TanStack Query caches pages,
and TanStack Table manages pagination and table rendering. Pagination applies
after filtering, sorting, and full-data aggregation, selecting transactions or
whole pivot row groups. There is no total row cap; Next is disabled after the
last page. Changing filters, grouping, sorting, result type, or page size resets
the offset to zero. Tables have no default height cap; fixed-height GridItem
containers supply vertical scrolling. Pivot tables retain their
24-column-group limit and indicate when columns are omitted.

There is no Limited / Full preview mode. Page size is view state, not part of
the saved source definition. Saving requires successful results for the exact
current definition and page. Previous successful results remain visible during
requests and errors. The stale warning appears only for an idle, edited draft;
it is suppressed alongside loading or error feedback in both editor modes.

All queries retain the user's account-access scope and exclude excluded
transactions. Category grouping preserves uncategorized transactions and
distinguishes categories with identical names. Missing intersections and null
aggregates show a dash; actual zeroes remain numeric. Amounts retain their
original signs: positive outflows and negative inflows. Their sum is not
automatically spending. Pivot monetary measures require either a single
filtered currency or Currency in Rows; currencies are never converted or added
together.
Relative date windows include today and the preceding days, excluding future
transactions. Filters combine with AND. Category supports **Equals** and
**Not equals**. Excluding a concrete category retains uncategorized transactions;
excluding **Uncategorized** retains only categorized transactions. These
conditions persist with the saved source definition.

Structured sources save a versioned definition, not generated query text, in the
browser-local source catalog. Their definition's column/group/measure choices
determine the result schema; Table visibility and Chart presentation remain
independent component settings.

### SureQL source editor

The query editor supports SureQL only: there is no language selector or PRQL
mode. Syntax highlighting, source suggestions, validation and Run all use
SureQL. The editor grows and shrinks with query content from 128px to 640px,
then scrolls internally for longer queries. Copy, Reset and Run use compact footer buttons
beside the cursor position and character count, without a separate query heading
or shortcut hint. Command/Ctrl+Enter still runs the query. **Run** executes
the draft query; **Save source** requires successful results for that exact
draft and a nonblank source name.

The SureQL editor and its preview each span the full available width. The
preview card uses Headless UI tabs: **Preview** shows the shared paginated
result table, and **Generated SQL** shows the executed SQL in a read-only
Monaco editor with SQL syntax highlighting. Switching tabs retains the page
and does not execute the query again.

Run requests **10 rows** initially, even when the draft contains `take 100`.
**Next / Previous** request server pages using a row offset rather than
fetching the whole result and slicing it in the browser. The inline **per page**
selector supports 10, 25, 50, or 100; changing it starts at the first page. Pagination
wraps the authorized compiled query, preserving its own `take` limits and
aggregation. The server probes one additional row to determine whether Next
is available, returning only the requested page. Preview and saved-table paging
are not subject to the non-paginated 50-row result cap.

Saved SureQL tables use the same server-side page requests as previews, preserving
the source query's own `take` and aggregation. Charts and chart-field selectors
fetch the complete result through those paged query requests, without a separate
chart-pivot query. Table-field selectors retain bounded metadata lookups.

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
