---
pm-project: true
id: "p_cd_pivot_charts"
title: "06 Pivot Chart Experience"
color: "#2563eb"
icon: "lucide-chart-spline"
taskIds: ["[[define-the-pivot-chart-contract|Define the pivot chart contract]]", "[[return-typed-sureql-field-metadata|Return typed SureQL field metadata]]", "[[execute-pivot-aggregations-on-the-server|Execute pivot aggregations on the server]]", "[[version-and-migrate-pivot-chart-configuration|Version and migrate pivot chart configuration]]", "[[build-the-pivot-chart-configurator|Build the pivot chart configurator]]", "[[render-pivot-chart-presentations|Render pivot chart presentations]]", "[[integrate-pivot-preview-save-and-fallback|Integrate pivot preview, save, and fallback]]", "[[harden-pivot-security-cardinality-and-performance|Harden pivot security, cardinality, and performance]]", "[[verify-and-select-the-pivot-chart-experience|Verify and select the pivot chart experience]]"]
parent: "[[Projects/Custom Dashboards/Custom Dashboards]]"
customFields: []
teamMembers: []
savedViews: []
createdAt: "2026-09-22T00:00:00.000Z"
updatedAt: "2026-09-22T00:00:00.000Z"
config:
  defaultView: "table"
  autoSchedule: false
---

# lucide-chart-spline 06 Pivot Chart Experience

Replace the current first-date/first-number chart guess with an explicit, saved pivot-chart configuration. The user chooses what to group by, what to measure, how to aggregate it, and how to visualize the result. SureQL remains the authorized source; aggregation executes on the server over the query result before preview row limits are applied.

## V1 boundary

- One category dimension, with an optional date bucket for date/time fields.
- Either one measure split by one optional series dimension, or up to three measures with no series dimension.
- `count`, `count distinct`, `sum`, `average`, `minimum`, and `maximum`, restricted by field type.
- Line, grouped-bar, and stacked-bar presentations. No pie, calculated fields, drag-only field wells, or client-side aggregation.
- Explicit sort and top-N controls bound category and series cardinality.
- A semantic result table remains available for every chart and is the fallback for invalid or unavailable configurations.

## Architecture decisions

- Extend the existing authorized SureQL compile/execute boundary; never aggregate the 50-row browser preview.
- Return server-derived field metadata instead of guessing types from sampled values.
- Treat chart configuration as versioned report data, separate from the saved query and grid layout.
- Keep draft query, draft chart configuration, and last saved card independent. Save only after the exact query-and-chart draft previews successfully.
- Keep TanStack Charts behind application-owned mapping and rendering modules; do not spread alpha-library types through dashboard state.

## Tasks

- [ ] [[define-the-pivot-chart-contract|Define the pivot chart contract]]
- [ ] [[return-typed-sureql-field-metadata|Return typed SureQL field metadata]]
- [ ] [[execute-pivot-aggregations-on-the-server|Execute pivot aggregations on the server]]
- [ ] [[version-and-migrate-pivot-chart-configuration|Version and migrate pivot chart configuration]]
- [ ] [[build-the-pivot-chart-configurator|Build the pivot chart configurator]]
- [ ] [[render-pivot-chart-presentations|Render pivot chart presentations]]
- [ ] [[integrate-pivot-preview-save-and-fallback|Integrate pivot preview, save, and fallback]]
- [ ] [[harden-pivot-security-cardinality-and-performance|Harden pivot security, cardinality, and performance]]
- [ ] [[verify-and-select-the-pivot-chart-experience|Verify and select the pivot chart experience]]

## Done when

A user can run a real authorized SureQL query, configure a valid pivot chart from typed returned fields, preview and save it, arrange the card, reload it, and inspect the equivalent result table. Empty data, incompatible fields, schema drift, excessive cardinality, invalid storage, and one failed report do not break the dashboard or expose unauthorized data.
