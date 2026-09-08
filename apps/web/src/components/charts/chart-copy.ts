// Localizable chart copy (t_alt_fnd_016).
//
// Every user-facing chart string EXCEPT data-driven names (month and holding
// labels, which come from the data) and locale-formatted values (which come
// from `SureChartLabels`) lives in a per-chart copy object — including
// accessibility-only strings (legend labels, data-table captions). Charts
// take an optional `copy` prop defaulting to the English factories below, so
// feature code never hardcodes chart text.
//
// Copy defaults are module-level factories; charts memoize the resolved
// object (`useMemo(() => copy ?? defaultXxxCopy(), [copy])`) so an omitted
// prop never rebuilds the TanStack definition on unrelated re-renders.
//
// INTEGRATION POINT (t_alt_fnd_011): the localization foundation builds
// these objects per locale (translators reorder the `{count}` and `{title}`
// placeholders freely) and passes them down alongside `SureChartLabels`.
// No chart changes are required — only the call sites that currently omit
// `copy`.
export interface ChartCopyBase {
	/** Accessible name for the visible legend list. */
	readonly legendLabel: string;
	/** Data-table caption; `{title}` is the chart title. */
	readonly tableCaptionTemplate: string;
	readonly emptyTitle: string;
	readonly emptyDescription: string;
	/** Prefix for the selection announcement ("Selected Feb: …"). */
	readonly selectedPrefix: string;
	/** Value column without currency — the chart appends `({currency})`. */
	readonly tableValueBase: string;
	/** Row label inside the hover/focus tooltip. */
	readonly tooltipValueLabel: string;
}

export interface NetWorthCopy extends ChartCopyBase {
	/** Axis title without currency — the chart appends `({currency})`. */
	readonly axisBase: string;
	/** Default accessible summary; `{count}` is the point count. */
	readonly summaryTemplate: string;
	readonly tableMonth: string;
}

export function defaultNetWorthCopy(): NetWorthCopy {
	return {
		legendLabel: "Legend",
		tableCaptionTemplate: "{title} data",
		axisBase: "Net worth",
		summaryTemplate: "Net worth over {count} months.",
		emptyTitle: "No net-worth data",
		emptyDescription: "Net worth will appear here once valuations are available.",
		selectedPrefix: "Selected",
		tableMonth: "Month",
		tableValueBase: "Value",
		tooltipValueLabel: "Net worth",
	};
}

export interface CashFlowCopy extends ChartCopyBase {
	readonly axisBase: string;
	readonly summaryTemplate: string;
	readonly seriesIncome: string;
	readonly seriesExpenses: string;
	readonly tableMonth: string;
	readonly tableSeries: string;
}

export function defaultCashFlowCopy(): CashFlowCopy {
	return {
		legendLabel: "Legend",
		tableCaptionTemplate: "{title} data",
		axisBase: "Cash flow",
		summaryTemplate: "Monthly income and expenses across {count} bars.",
		emptyTitle: "No cash-flow data",
		emptyDescription: "Income and expenses will appear here once transactions are imported.",
		selectedPrefix: "Selected",
		seriesIncome: "Income",
		seriesExpenses: "Expenses",
		tableMonth: "Month",
		tableSeries: "Series",
		tableValueBase: "Amount",
		tooltipValueLabel: "Amount",
	};
}

export interface AllocationCopy extends ChartCopyBase {
	/** Default accessible summary; `{count}` is the slice count. */
	readonly summaryTemplate: string;
	readonly totalLabel: string;
	readonly unallocatedLabel: string;
	readonly tableHolding: string;
	readonly tableShare: string;
}

export function defaultAllocationCopy(): AllocationCopy {
	return {
		legendLabel: "Legend",
		tableCaptionTemplate: "{title} data",
		summaryTemplate: "Portfolio allocation across {count} slices.",
		emptyTitle: "No allocation data",
		emptyDescription: "Holdings will appear here once accounts are connected.",
		selectedPrefix: "Selected",
		totalLabel: "Total",
		unallocatedLabel: "Unallocated",
		tableHolding: "Holding",
		tableValueBase: "Value",
		tableShare: "Share",
		tooltipValueLabel: "Value",
	};
}

/** Substitute the `{count}` placeholder (translators may reorder it). */
export function applyCountTemplate(template: string, count: number): string {
	return template.replace("{count}", String(count));
}

/** Substitute the `{title}` placeholder (translators may reorder it). */
export function applyTitleTemplate(template: string, title: string): string {
	return template.replace("{title}", title);
}
