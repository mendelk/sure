# Views, components and interaction

Design tokens, `DS::*` reuse and reviewer severity live in the
[design system guide](design-system.md), which is also the always-on Cursor
design adapter. This guide covers templates, Hotwire, Stimulus and localization.

## Hotwire and templates

Prefer semantic native HTML, including `<dialog>` and `<details><summary>`, using
existing DS wrappers where available. Use Turbo Frames for page sections. Turbo
Streams should enhance functionality, not be its sole dependency.

Keep state in URL query parameters before reaching for local storage or sessions;
use the database when persistent state is necessary. Format money, numbers and
dates server-side and pass display values to Stimulus. Client-side behavior is
appropriate for interactions such as bulk selection where server round trips would
hurt usability.

Use an existing component first, then an existing partial. Create a ViewComponent
for reusable or complex styling/logic, variants/sizes, interaction, slots or a
configurable API, and accessibility/ARIA behavior. Use partials for mostly static,
simple or context-specific template content. Keep domain logic out of ERB; compute
presentation logic in helpers or component Ruby files.

Follow the names of nearby components, including the `DS::*` namespace; do not
impose the obsolete `ButtonComponent`/`DialogComponent` examples on this design
system. Partials use an underscore prefix; shared partials live in
`app/views/shared/`, context-specific partials under their controller's views.

## Account editing

The SPA Accounts list's **Edit** menu action and draft-account **Complete setup**
button use TanStack navigation, not the server-provided legacy edit URL.
Credit cards and other generic account types open `/accounts/:id/edit`; loans
and properties retain their specialized `/loans/:id/edit` and
`/properties/:id/edit` SPA editors. Keep account-list navigation consistent with
the account-detail actions so SPA-only settings remain reachable.

## Bulk transaction tags

The bulk-edit drawer on Transactions and account activity has separate **Tags to
add** and **Tags to remove** pickers. Changes are incremental for each selected
transaction; unrelated tags and empty selections stay unchanged. Choosing a tag
in one picker clears it from the other. The server accepts `tag_ids_to_add` and
`tag_ids_to_remove`, with removal taking precedence if a request includes both.
The removal picker only selects existing tags. Explicit tag changes lock the tag
attribute against enrichment, including when the last tag is removed.

## SPA charts

SPA charts use TanStack's native marks, scales, focus, and responsive hosts.
Shared definitions and infrastructure live in `app/javascript/charts/`:
semantic theme/colors, accessible native tooltips, UTC calendar-day helpers,
comparison charts, polar charts, and the specialized Sankey definition.
Feature components retain financial data, server-formatted money, filters,
drill-down URLs, center content, and legends.

`DonutChart` shares polar rendering and chart/list focus without rebuilding
definitions on hover. Source pies use the same polar factory. Account and
home net-worth charts share `useTimeSeriesInteraction`; callers own the local
viewport, cancellation restores its origin, editable fields retain focus, and
coarse pointers keep normal scrolling. Singleton date domains use the shared
half-day padding without changing the source dates.

The shared tooltip delegates layout/content/lifecycle to TanStack and applies
design tokens. Pointer updates use `role="tooltip"` with announcements off;
keyboard updates use `role="status"` with polite announcements. Authored forecast
markers retain focus ownership so generic focus rings cannot hide risk colors.
Dashboard reorder keys apply only when the section itself is focused, not when
an embedded chart or control receives the key.

These shared modules currently serve the SPA only. ERB/Stimulus charts and print
rendering retain their existing implementations.

## Account charts

The account SPA's `AccountChartCard` isolates chart-rendering failures behind a
local error boundary. Its localized fallback leaves account details and activity
available, supports retry, and resets when a new chart payload arrives.

Single-day periods are valid, including newly opened accounts viewed over All
Time. The chart centers these on a one-day display window so TanStack's scale
and viewport have distinct endpoints; the selected period and source data stay
unchanged. Keep the full scale extent and initial viewport on the same window.

## Stimulus

- Declare actions in HTML (`data-action="click->toggle#toggle"`) rather than
  imperatively registering event listeners in controller initialization.
- Keep controllers focused on one responsibility or tightly related responsibilities;
  domain logic belongs on the server.
- Aim for fewer than seven targets. Use private helpers and a clear public API,
  with Stimulus callbacks, actions, targets, values and classes.
- Controllers in `app/components/` belong only to their component templates;
  global controllers in `app/javascript/controllers/` may be shared across views.
- Pass data through `data-*-value` attributes rather than inline JavaScript. Use
  Stimulus targets rather than manual `getElementById` lookups.

## Localization

Use `t()` for all user-facing strings and update the corresponding locale files
under `config/locales/`. Follow the feature's existing locale organization; there
is no requirement to put every new key in a single `en.yml`.

Use descriptive, hierarchical keys such as `accounts.index.title` and
`components.transaction_details.show_details`. Group related keys together; use
interpolation (`t("users.greeting", name: user.name)`) and Rails pluralization
(`t("transactions.count", count: count)`) for dynamic text. Keep examples localized
too. Configure missing translations to raise during development; do not assume that this option is currently enabled in the
checked-in environment configuration.
